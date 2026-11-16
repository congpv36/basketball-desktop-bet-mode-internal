/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-constant-condition */
import { setTimeout } from 'timers/promises'
import { parentPort } from 'worker_threads'

import { Account, clearTable, createModel, Setting } from '@db/model'
import dataCrawlByPlatformSchema from '@db/schema/dataCrawlByPlatform'
import { SettingSchemaType } from '@db/schema/setting'
import { HttpsProxyAgent } from 'https-proxy-agent'
import fetch from 'node-fetch'

import {
  GAME_TYPES,
  HDP_FH,
  HDP_FT,
  OU_FH,
  OU_FT,
  SPREAD,
  TARGET_TYPE,
  TOTAL
} from '@shared/common/constants'
import { AccountType, NameTeamType } from '@shared/common/types'
import { OPTIONS_PROXY, STATUS_ACCOUNT, STATUS_LOGIN } from '@shared/main/constants'

import { isAccountActive } from '@/worker/lib/checkAccount'
import { checkGameType } from '@/worker/lib/checkGameType'
import { logAndNotify, logAndTriggerRelogin, logCrawlError } from '@/worker/lib/exitAccountWithLog'
import { findActiveAccount } from '@/worker/lib/findActiveAccount'
import { findStandardTeam } from '@/worker/lib/findStandardTeam'
import { insertRecords } from '@/worker/lib/insertRecords'
import { isProxyConfigValid } from '@/worker/lib/isProxyConfigValid'
import { isVirtualLeague } from '@/worker/lib/isVirtualLeague'
import { logTime } from '@/worker/lib/logTime'
import { systemLogToFile } from '@/worker/lib/systemLogToFile'
import { toPositiveNumber } from '@/worker/lib/toPositiveNumber'
import { PLATFORM } from '@/worker/platform/platform.config'
import { getBalancePs3838 } from '@/worker/platform/Ps3838/actions/getBalance'
import {
  buildHeadersBalancePs3838,
  buildHeadersPs3838,
  gameTypeMapPs3838
} from '@/worker/platform/Ps3838/common/contants'
import { buildPlatformUrl, buildTokenHeaders, parseTokens } from '@/worker/platform/Ps3838/helper'

let gameType: string | null = null

const port = parentPort
if (!port) throw new Error('IllegalState')

port.on('message', async (action: string) => {
  if (action == 'Start') {
    try {
      await handleCrawlData()
    } catch (error) {
      await systemLogToFile(`Error Handle Crawl Data Ps3838: ${JSON.stringify(error)}`, 'Error')
    }
  }
})

const handleCrawlData = async () => {
  while (true) {
    clearTable(PLATFORM.PS3838)

    const account = Account.findOne({
      platformName: PLATFORM.PS3838,
      status: STATUS_ACCOUNT.LOGOUT,
      statusLogin: STATUS_LOGIN.SUCCESS,
      orderID: 1
    }) as AccountType

    if (!account) {
      await setTimeout(2000)
      continue
    }

    await fnCrawlData(account)
    await setTimeout(5000)
  }
}
const fnCrawlData = async (account: AccountType) => {
  const settings = Setting.findAll() as SettingSchemaType[]
  if (!settings.length) return

  gameType = settings[0].gameType
  if (!gameType || gameType === GAME_TYPES.NONE) return

  const accountInfo = findActiveAccount(account.id)
  if (!accountInfo) return

  if (accountInfo.typeCrawl !== gameType) {
    await logAndNotify(port, account, 'GameType changed, check box refresh to sync.', {
      fields: { status: STATUS_ACCOUNT.EXIT }
    })

    clearTable(PLATFORM.PS3838)
    return
  }

  const { status, data } = isProxyConfigValid(account)
  const { newIpAddress, newPort, newUsername, newPassword } = data

  const proxyUrl =
    status && account.proxyScope !== OPTIONS_PROXY.NONE
      ? `http://${newUsername}:${newPassword}@${newIpAddress}:${newPort}`
      : undefined

  const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined

  const { ErrorCode, Message, cashBalance, outstanding, givenCredit, credit, currency } =
    await getBalancePs3838(account)

  if (ErrorCode !== 0) {
    await logAndTriggerRelogin(port, account, `Get balance failed: ${Message}`)
    return
  }

  await logAndNotify(port, account, `Balance updated: ${cashBalance} ${currency}`, {
    fields: { cashBalance, outstanding, givenCredit, credit, currency }
  })

  try {
    const tokens = parseTokens(accountInfo.token)

    const resKeepAlive = await fetch(buildPlatformUrl(accountInfo, 'KEEP_ALIVE'), {
      method: 'GET',
      headers: {
        ...buildHeadersBalancePs3838(accountInfo, accountInfo.vHucode),
        ...buildTokenHeaders(tokens),
        Cookie: accountInfo.cookie
      },
      ...(proxyAgent && { agent: proxyAgent })
    })

    const vHucode = resKeepAlive.headers.get('v-hucode')
    if (!vHucode) {
      throw new Error('V-hucode not found')
    }

    const mk: number = gameTypeMapPs3838[gameType] //(0-Early;1-Today;2-Live)

    if (
      !(await logAndNotify(port, account, `Get Basketball ${gameType}...`, {
        strictMatch: { orderID: 1, platformName: PLATFORM.PS3838 }
      }))
    )
      return

    const url = `${account.loginURL}sports-service/sv/compact/events?mk=${mk}&sp=4&btg=1&c=&cl=100&d=&ec=&ev=&g=QQ%3D%3D&hle=false&ic=false&ice=false&inl=false&l=100&lang=&lg=&lv=0&me=0&me01=&more=false&o=1&ot=4&pa=0&pimo=0%2C1&pn=-1&pv=1&tm=0&v=0&locale=en_US&_=${Date.now()}&withCredentials=true`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...buildHeadersPs3838(account, vHucode),
        ...buildTokenHeaders(tokens),
        'x-app-data':
          'dpAOW=q9pmurY_jhI_X;pctag=dc821180-c6c2-4fe5-adaa-5fd0e6fcce72;directusToken=TwEdnphtyxsfMpXoJkCkWaPsL2KJJ3lo;PCTR=1947977955312;BrowserSessionId=d4f68c87-aaba-4d2c-a108-403d6a0331ea;_og=QQ%3D%3D;_ulp=aEJSR05ZdTBuUjZxYldBTUhPQm0wZzFPcXdVbnd5dnhDZ3cwa040QUtlKzc1eHpJMlJOYUx3TG5FZitRcGdrcWJmbk5GWkltSDNQWEJPVkVDR0Npd3c9PXwyOTA2N2ZjNTRkNTk0ZDZlMWEzMzQzOTNiMjkxNDMyMA%3D%3D;custid=id%3DBCB3700234%26login%3D202609232059%26roundTrip%3D202609232059%26hash%3D09ED7967BCBEEBF58E94F9A79D74C272;_userDefaultView=COMPACT;__prefs=W251bGwsNCwxLDAsMSxudWxsLGZhbHNlLDAuMDAwMCxmYWxzZSx0cnVlLCJBTEwiLC0xLG51bGwsdHJ1ZSx0cnVlLGZhbHNlLGZhbHNlLG51bGwsbnVsbCx0cnVlLCJTTUFMTCIsMSx0cnVlXQ%3D%3D;lang=en_US',
        Cookie: account.cookie
      },
      ...(proxyAgent && { agent: proxyAgent })
    })

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      const text = await res.text()
      console.error(`${logTime()}Response is not JSON:`, text)
      throw new Error('Received non-JSON response')
    }

    const resData = await res.json()

    let dataPs3838: any
    if (mk === 0 || mk === 1) {
      dataPs3838 = resData.n[0][2]
    } else if (mk === 2) {
      dataPs3838 = resData.l[0][2]
    }

    if (!dataPs3838.length) {
      await logAndNotify(port, account, `Basketball ${gameType}: No data.`, {
        strictMatch: { orderID: 1, platformName: PLATFORM.PS3838 }
      })

      clearTable(PLATFORM.PS3838)

      port.postMessage({
        type: 'CrawlDone',
        platformName: PLATFORM.PS3838
      })
      return
    }

    await handleData({ dataPs3838, account })
  } catch (error) {
    await logCrawlError(port, account, error, 'Crawl Data Ps3838', {
      clearTablePlatform: PLATFORM.PS3838
    })
  }
}

const handleData = async ({ dataPs3838, account }) => {
  clearTable(PLATFORM.PS3838)

  if (!gameType || gameType === GAME_TYPES.NONE) return
  const Ps3838 = createModel(PLATFORM.PS3838, dataCrawlByPlatformSchema)

  const timeStart = new Date().getTime()
  const records: any[] = []
  const eventsLength = dataPs3838.length

  for (const [leagueIndex, league] of dataPs3838.entries()) {
    if (!isAccountActive(account.id)) return
    if (!checkGameType(account.platformName, gameType)) {
      await logAndNotify(port, account, 'GameType changed during crawl, stop processing.')
      return
    }

    const timeLeagueStart = new Date().getTime()

    const [id, name, events] = league
    const nameLeague = name.trim()
    if (isVirtualLeague(nameLeague)) continue

    for (const event of events) {
      if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

      const idEvent = event[0]
      const nameHome = event[1].trim()
      const nameAway = event[2].trim()

      const dateEvent = new Date(event[4])

      const date = dateEvent.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit'
      })

      const time = dateEvent.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      })

      const standardHomeName = findStandardTeam({
        nameTeam: nameHome,
        nameLeague,
        platform: PLATFORM.PS3838
      }) as NameTeamType

      const standardAwayName = findStandardTeam({
        nameTeam: nameAway,
        nameLeague,
        platform: PLATFORM.PS3838
      }) as NameTeamType

      const league = standardHomeName?.league || nameLeague.toUpperCase()
      const home = standardHomeName?.team || nameHome.toUpperCase()
      const away = standardAwayName?.team || nameAway.toUpperCase()

      const hasValidData = event[9]

      const score = hasValidData ? `${event[9][0]}-${event[9][1]}` : null
      const stat = hasValidData ? `${event[16] || ''} ${event[15] || ''}`.trim() : null

      if (gameType == GAME_TYPES.RUNNING && !score && !stat) continue

      if (event && event[8] && event[8]['0'] && event[8]['0'][0]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const periodsFull = event[8]['0'][0]
        if (periodsFull && periodsFull.length > 0) {
          for (const periodFull of periodsFull) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return
            if (+periodFull[3] == 0 || +periodFull[4] == 0) continue

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.FULL_TIME,
              score,
              stat,
              type: 'HDP',
              altLineId: periodFull[7],
              hdp_point: periodFull[1],
              home_over: +periodFull[3],
              away_under: +periodFull[4],
              typeOdd: SPREAD,
              league,
              home,
              away,
              specialOdd: periodFull[8],
              betType: HDP_FT,
              HDP: toPositiveNumber(periodFull[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }
      if (event && event[8] && event[8]['0'] && event[8]['0'][1]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const totalsFull = event[8]['0'][1]
        if (totalsFull && totalsFull.length > 0) {
          for (const totalFull of totalsFull) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return
            if (+totalFull[2] == 0 || +totalFull[3] == 0) continue

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague: name,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.FULL_TIME,
              score,
              stat,
              type: 'OU',
              altLineId: totalFull[4],
              hdp_point: totalFull[1],
              home_over: +totalFull[2],
              away_under: +totalFull[3],
              typeOdd: TOTAL,
              league,
              home,
              away,
              specialOdd: totalFull[5],
              betType: OU_FT,
              HDP: toPositiveNumber(totalFull[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }

      if (event && event[8] && event[8]['1'] && event[8]['1'][0]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const periodsHalf = event[8]['1'][0]
        if (periodsHalf && periodsHalf.length > 0) {
          for (const periodHalf of periodsHalf) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague: name,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.FIRST_TIME,
              score,
              stat,
              type: 'HDP',
              altLineId: periodHalf[7],
              hdp_point: periodHalf[1],
              home_over: +periodHalf[3],
              away_under: +periodHalf[4],
              typeOdd: SPREAD,
              league,
              home,
              away,
              specialOdd: periodHalf[8],
              betType: HDP_FH,
              HDP: toPositiveNumber(periodHalf[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }
      if (event && event[8] && event[8]['1'] && event[8]['1'][1]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const totalsHalf = event[8]['1'][1]
        if (totalsHalf && totalsHalf.length > 0) {
          for (const totalHalf of totalsHalf) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague: name,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.FIRST_TIME,
              score,
              stat,
              type: 'OU',
              altLineId: totalHalf[4],
              hdp_point: totalHalf[1],
              home_over: +totalHalf[2],
              away_under: +totalHalf[3],
              typeOdd: TOTAL,
              league,
              home,
              away,
              specialOdd: totalHalf[5],
              betType: OU_FH,
              HDP: toPositiveNumber(totalHalf[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }

      if (event && event[8] && event[8]['3'] && event[8]['3'][0]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const periodsFull = event[8]['3'][0]
        if (periodsFull && periodsFull.length > 0) {
          for (const periodFull of periodsFull) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return
            if (+periodFull[3] == 0 || +periodFull[4] == 0) continue

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.FIRST_QUARTER,
              score,
              stat,
              type: 'HDP',
              altLineId: periodFull[7],
              hdp_point: periodFull[1],
              home_over: +periodFull[3],
              away_under: +periodFull[4],
              typeOdd: SPREAD,
              league,
              home,
              away,
              specialOdd: periodFull[8],
              betType: HDP_FT,
              HDP: toPositiveNumber(periodFull[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }
      if (event && event[8] && event[8]['3'] && event[8]['3'][1]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const totalsFull = event[8]['3'][1]
        if (totalsFull && totalsFull.length > 0) {
          for (const totalFull of totalsFull) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return
            if (+totalFull[2] == 0 || +totalFull[3] == 0) continue

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague: name,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.FIRST_QUARTER,
              score,
              stat,
              type: 'OU',
              altLineId: totalFull[4],
              hdp_point: totalFull[1],
              home_over: +totalFull[2],
              away_under: +totalFull[3],
              typeOdd: TOTAL,
              league,
              home,
              away,
              specialOdd: totalFull[5],
              betType: OU_FT,
              HDP: toPositiveNumber(totalFull[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }

      if (event && event[8] && event[8]['4'] && event[8]['4'][0]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const periodsFull = event[8]['4'][0]
        if (periodsFull && periodsFull.length > 0) {
          for (const periodFull of periodsFull) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return
            if (+periodFull[3] == 0 || +periodFull[4] == 0) continue

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.SECOND_QUARTER,
              score,
              stat,
              type: 'HDP',
              altLineId: periodFull[7],
              hdp_point: periodFull[1],
              home_over: +periodFull[3],
              away_under: +periodFull[4],
              typeOdd: SPREAD,
              league,
              home,
              away,
              specialOdd: periodFull[8],
              betType: HDP_FT,
              HDP: toPositiveNumber(periodFull[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }
      if (event && event[8] && event[8]['4'] && event[8]['4'][1]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const totalsFull = event[8]['4'][1]
        if (totalsFull && totalsFull.length > 0) {
          for (const totalFull of totalsFull) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return
            if (+totalFull[2] == 0 || +totalFull[3] == 0) continue

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague: name,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.SECOND_QUARTER,
              score,
              stat,
              type: 'OU',
              altLineId: totalFull[4],
              hdp_point: totalFull[1],
              home_over: +totalFull[2],
              away_under: +totalFull[3],
              typeOdd: TOTAL,
              league,
              home,
              away,
              specialOdd: totalFull[5],
              betType: OU_FT,
              HDP: toPositiveNumber(totalFull[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }

      if (event && event[8] && event[8]['5'] && event[8]['5'][0]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const periodsFull = event[8]['5'][0]
        if (periodsFull && periodsFull.length > 0) {
          for (const periodFull of periodsFull) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return
            if (+periodFull[3] == 0 || +periodFull[4] == 0) continue

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.THIRD_QUARTER,
              score,
              stat,
              type: 'HDP',
              altLineId: periodFull[7],
              hdp_point: periodFull[1],
              home_over: +periodFull[3],
              away_under: +periodFull[4],
              typeOdd: SPREAD,
              league,
              home,
              away,
              specialOdd: periodFull[8],
              betType: HDP_FT,
              HDP: toPositiveNumber(periodFull[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }
      if (event && event[8] && event[8]['5'] && event[8]['5'][1]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const totalsFull = event[8]['5'][1]
        if (totalsFull && totalsFull.length > 0) {
          for (const totalFull of totalsFull) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return
            if (+totalFull[2] == 0 || +totalFull[3] == 0) continue

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague: name,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.THIRD_QUARTER,
              score,
              stat,
              type: 'OU',
              altLineId: totalFull[4],
              hdp_point: totalFull[1],
              home_over: +totalFull[2],
              away_under: +totalFull[3],
              typeOdd: TOTAL,
              league,
              home,
              away,
              specialOdd: totalFull[5],
              betType: OU_FT,
              HDP: toPositiveNumber(totalFull[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }

      if (event && event[8] && event[8]['6'] && event[8]['6'][0]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const periodsFull = event[8]['6'][0]
        if (periodsFull && periodsFull.length > 0) {
          for (const periodFull of periodsFull) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return
            if (+periodFull[3] == 0 || +periodFull[4] == 0) continue

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.FOURTH_QUARTER,
              score,
              stat,
              type: 'HDP',
              altLineId: periodFull[7],
              hdp_point: periodFull[1],
              home_over: +periodFull[3],
              away_under: +periodFull[4],
              typeOdd: SPREAD,
              league,
              home,
              away,
              specialOdd: periodFull[8],
              betType: HDP_FT,
              HDP: toPositiveNumber(periodFull[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }
      if (event && event[8] && event[8]['6'] && event[8]['6'][1]) {
        if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

        const totalsFull = event[8]['6'][1]
        if (totalsFull && totalsFull.length > 0) {
          for (const totalFull of totalsFull) {
            if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType))
              return
            if (+totalFull[2] == 0 || +totalFull[3] == 0) continue

            records.push({
              gameType,
              date,
              time,
              platform: PLATFORM.PS3838,
              idLeague: id,
              nameLeague: name,
              idEvent,
              nameHome,
              nameAway,
              targetType: TARGET_TYPE.FOURTH_QUARTER,
              score,
              stat,
              type: 'OU',
              altLineId: totalFull[4],
              hdp_point: totalFull[1],
              home_over: +totalFull[2],
              away_under: +totalFull[3],
              typeOdd: TOTAL,
              league,
              home,
              away,
              specialOdd: totalFull[5],
              betType: OU_FT,
              HDP: toPositiveNumber(totalFull[1])
            })

            insertRecords(records, Ps3838)
          }
        }
      }

      if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return
    }

    const timeLeagueEnd = new Date().getTime()
    await logAndNotify(
      port,
      account,
      `Handle Data League Done. (${leagueIndex + 1}/${eventsLength}, ${timeLeagueEnd - timeLeagueStart}ms)`
    )
  }

  if (records.length > 0) {
    insertRecords(records, Ps3838)
  }

  if (!isAccountActive(account.id) || !checkGameType(account.platformName, gameType)) return

  port.postMessage({
    type: 'CrawlDone',
    platformName: PLATFORM.PS3838
  })
  const timeEnd = new Date().getTime()
  await logAndNotify(
    port,
    account,
    `Handle Data Event Done All. Total (${eventsLength}/${timeEnd - timeStart}ms)`,
    { strictMatch: { orderID: 1, platformName: PLATFORM.PS3838 } }
  )
}
