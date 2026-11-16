/* eslint-disable @typescript-eslint/no-explicit-any */
import { parentPort } from 'worker_threads'

import Model, {
  createModel,
  EventViva88,
  IndexViva88,
  LeagueViva88,
  NameLeague,
  Setting
} from '@db/model'
import dataCrawlByPlatformSchema from '@db/schema/dataCrawlByPlatform'
import { EventViva88Type } from '@db/schema/eventViva88'
import { LeagueViva88Type } from '@db/schema/leagueViva88'
import { SettingSchemaType } from '@db/schema/setting'

import { GAME_TYPES } from '@shared/common/constants'
import { DataCrawlType, NameLeagueType, NameTeamType } from '@shared/common/types'

import { findStandardTeam } from '@/worker/lib/findStandardTeam'
import { isVirtualLeague } from '@/worker/lib/isVirtualLeague'
import { toPositiveNumber } from '@/worker/lib/toPositiveNumber'
import { PLATFORM } from '@/worker/platform/platform.config'
import {
  getTargetTypeByParentId,
  getTypes,
  normalizeLeagueName
} from '@/worker/platform/Viva88/helper'
const port = parentPort
if (!port) throw new Error('IllegalState')

port.on('message', async ({ data }) => {
  if (!data) return

  await handleData(data)
})

async function handleData(data: any) {
  const Viva88Bet = createModel(PLATFORM.VIVA88BET, dataCrawlByPlatformSchema)

  const records: any[] = []
  const BATCH_SIZE: number = 50
  const dataLeagueViva88bet = NameLeague.findAll({
    platform: PLATFORM.VIVA88BET
  }) as NameLeagueType[]

  const [type, message, content] = JSON.parse(data.substring(2))
  const targetKeys = [
    'matchid',
    'leagueid',
    'leaguenameen',
    'hteamnameen',
    'ateamnameen',
    'oddsstatus',
    'livehomescore',
    'liveawayscore',
    'isht',
    'bettype',
    'kickofftime',
    'liveperiod',
    'livetimer',
    'oddsid',
    'hdp1',
    'hdp2',
    'parenttypeid',
    'odds1a',
    'odds2a'
  ]
  let finalAbsoluteMap: Record<string, number> = {}
  const dataSetting = Setting.findAll() as SettingSchemaType[]
  const gameType = dataSetting[0].gameType
  if (type === 'm' && message && content) {
    try {
      for (const row of content) {
        if (row[0] === 'f' && typeof row[1] === 'number' && Array.isArray(row[2])) {
          const fieldGroup = row[1]
          const fieldNames = row[2]

          for (const key of targetKeys) {
            const index = fieldNames.indexOf(key)
            if (index !== -1) {
              finalAbsoluteMap[key] = fieldGroup + index
            }
          }
          const hasAllKeys = targetKeys.every((key) => key in finalAbsoluteMap)
          if (hasAllKeys) {
            IndexViva88.deleteAll()
          }
        }
      }
      if (finalAbsoluteMap && Object.keys(finalAbsoluteMap).length > 0) {
        await IndexViva88.create(finalAbsoluteMap)
      } else {
        const newest = await IndexViva88.getNewest()
        finalAbsoluteMap = newest ? (({ id, ...rest }) => rest)(newest) : {}
      }
      for (const row of content) {
        if (row[1] === 'l') {
          const leagueInfo: Record<string, any> = {}
          for (let i = 0; i < row.length; i += 2) {
            const key = row[i]
            const value = row[i + 1]
            const matchKey = Object.keys(finalAbsoluteMap).find((k) => finalAbsoluteMap[k] == key)
            if (matchKey) {
              leagueInfo[matchKey] = value
            }
          }
          const nameLeague = leagueInfo.leaguenameen.trim().replace(/^\*/, '').trim()

          if (nameLeague.includes(' - ')) continue
          if (isVirtualLeague(nameLeague)) continue

          let findLeague: LeagueViva88Type | undefined
          if (leagueInfo.leagueid || leagueInfo.leaguenameen) {
            findLeague = leagueInfo.leagueid
              ? (LeagueViva88.findOne({ idLeague: leagueInfo.leagueid }) as LeagueViva88Type)
              : (LeagueViva88.findOne({ nameLeague: leagueInfo.leaguenameen }) as LeagueViva88Type)

            const nameLeague = leagueInfo.leaguenameen?.trim() ?? ''
            const targetLeagueName = nameLeague

            if (!findLeague) {
              const standardLeague = dataLeagueViva88bet.find(
                ({ nameLeague }) => nameLeague === targetLeagueName
              )

              const league = normalizeLeagueName(standardLeague?.league ?? nameLeague)

              LeagueViva88.create({
                idLeague: leagueInfo.leagueid,
                nameLeague,
                league
              })
            }
          }
        }
      }

      for (const row of content) {
        if (row[1] === 'm') {
          const matchInfo: Record<string, any> = {}

          const reverseMap = createReverseMap(finalAbsoluteMap)
          for (let i = 0; i < row.length; i += 2) {
            const key = row[i]
            const value = row[i + 1]
            const matchKey = reverseMap[key]
            if (matchKey) {
              matchInfo[matchKey] = value
            }
          }

          const existingEvent = EventViva88.findOne({
            idEvent: matchInfo.matchid
          }) as EventViva88Type

          if (matchInfo.leagueid === undefined && existingEvent) {
            matchInfo.leagueid = existingEvent.idLeague
            matchInfo.hteamnameen = existingEvent.nameHome
            matchInfo.ateamnameen = existingEvent.nameAway
            matchInfo.isht = existingEvent.isht
          }

          const league = LeagueViva88.findOne({ idLeague: matchInfo.leagueid }) as LeagueViva88Type
          if (!league) continue

          if (
            typeof matchInfo?.hteamnameen !== 'string' ||
            typeof matchInfo?.ateamnameen !== 'string'
          )
            continue

          const nameHome = matchInfo.hteamnameen.trim()
          const nameAway = matchInfo.ateamnameen.trim()

          const nameLeague = league.nameLeague.trim()

          const standardHomeName = findStandardTeam({
            nameTeam: nameHome,
            nameLeague,
            platform: PLATFORM.VIVA88BET
          }) as NameTeamType

          const standardAwayName = findStandardTeam({
            nameTeam: nameAway,
            nameLeague,
            platform: PLATFORM.VIVA88BET
          }) as NameTeamType

          if (!existingEvent) {
            const mappedLeague = standardHomeName?.league || league.league || league.nameLeague

            const newEvent = {
              idEvent: matchInfo.matchid,
              nameHome,
              nameAway,
              home: standardHomeName?.team || nameHome.toUpperCase(),
              away: standardAwayName?.team || nameAway.toUpperCase(),
              idLeague: matchInfo.leagueid,
              liveawayscore: gameType == GAME_TYPES.RUNNING ? (matchInfo.liveawayscore ?? 0) : null,
              livehomescore: gameType == GAME_TYPES.RUNNING ? (matchInfo.livehomescore ?? 0) : null,
              livetimer: Number(matchInfo.livetimer) ?? null,
              nameLeague: league.nameLeague,
              league: mappedLeague,
              liveperiod: matchInfo.liveperiod ?? 1,
              isht: matchInfo.isht ? 'HT' : ''
            }
            EventViva88.create(newEvent)
          } else {
            const updateFields: Record<string, any> = {}
            const updateData: Record<string, any> = {}

            let {
              livehomescore: homeScore,
              liveawayscore: awayScore,
              liveperiod,
              livetimer,
              isht
            } = existingEvent

            const isRunning = gameType === GAME_TYPES.RUNNING

            // helper để update nếu giá trị hợp lệ
            const assignIfValid = (key: string, value: any) => {
              if (isRunning && value !== null && value !== undefined) {
                if (key === 'isht') value = ''
                updateData[key] = value
                return value
              }
              return undefined
            }

            // --- UPDATE SCORE, PERIOD, TIMER, ISHT ---
            const newHomeScore = assignIfValid('livehomescore', matchInfo.livehomescore)
            const newAwayScore = assignIfValid('liveawayscore', matchInfo.liveawayscore)
            const newLivePeriod = assignIfValid('liveperiod', matchInfo.liveperiod)
            const newLiveTimer = assignIfValid('livetimer', matchInfo.livetimer)
            const newIsHT = assignIfValid('isht', matchInfo.isht)

            // Gán lại nếu có giá trị mới
            homeScore = newHomeScore ?? homeScore
            awayScore = newAwayScore ?? awayScore
            liveperiod = newLivePeriod ?? liveperiod
            livetimer = newLiveTimer ?? livetimer
            isht = newIsHT ?? isht

            // --- UPDATE DATABASE ---
            if (Object.keys(updateData).length > 0) {
              EventViva88.update({ idEvent: matchInfo.matchid }, updateData)
            }

            if (isRunning) {
              updateFields.score = `${homeScore ?? '0'}-${awayScore ?? '0'}`
              updateFields.stat = getElapsedTime(livetimer, liveperiod, gameType)
            }

            if (Object.keys(updateFields).length > 0) {
              Viva88Bet.updateMany({ idEvent: matchInfo.matchid }, updateFields)
            }
          }
        }
        if (row[1] === 'o') {
          const matchInfo: Record<string, any> = {}
          for (let i = 0; i < row.length; i += 2) {
            const key = row[i]
            const value = row[i + 1]
            const matchKey = Object.keys(finalAbsoluteMap).find((k) => finalAbsoluteMap[k] == key)
            if (matchKey) {
              matchInfo[matchKey] = value
            }
          }

          let leagueid = matchInfo?.leagueid ?? 0

          const getLeagueid = (await EventViva88.findOne({ idEvent: matchInfo.matchid })) as any

          if (getLeagueid) {
            leagueid = getLeagueid.idLeague
            matchInfo.hteamnameen = getLeagueid.nameHome ?? matchInfo.hteamnameen
            matchInfo.ateamnameen = getLeagueid.nameAway ?? matchInfo.ateamnameen
            matchInfo.leagueid = getLeagueid.idLeague ?? matchInfo.leagueid
            matchInfo.league = getLeagueid.league
            matchInfo.home = getLeagueid.home
            matchInfo.away = getLeagueid.away
            matchInfo.livetimer = matchInfo?.livetimer ?? getLeagueid?.livetimer
            matchInfo.liveperiod = matchInfo?.liveperiod ?? getLeagueid?.liveperiod
            matchInfo.livehomescore = matchInfo?.livehomescore ?? getLeagueid?.livehomescore
            matchInfo.liveawayscore = matchInfo?.liveawayscore ?? getLeagueid?.liveawayscore
          }

          if (leagueid === 0 && matchInfo.oddsid) {
            const findTicketL = (await Viva88Bet.findOne({
              altLineId: matchInfo.oddsid
            })) as any

            leagueid = findTicketL?.idLeague ?? 0
            if (findTicketL) {
              matchInfo.livetimer = matchInfo.livetimer ?? findTicketL.livetimer
              matchInfo.liveperiod = matchInfo.liveperiod ?? findTicketL.liveperiod
            }
          }

          let findLeague: LeagueViva88Type | undefined = undefined

          if (leagueid) {
            findLeague = (await LeagueViva88.findOne({ idLeague: leagueid })) as LeagueViva88Type
          }

          if (!findLeague) continue

          const findTicket = Viva88Bet.findOne({
            altLineId: matchInfo?.oddsid
          }) as DataCrawlType

          if (!matchInfo?.oddsid) continue

          if (!findTicket) {
            if (!matchInfo?.oddsid && !matchInfo?.matchid) continue

            const { typeOdd, type } = getTypes(matchInfo.parenttypeid)

            const score =
              gameType == GAME_TYPES.RUNNING
                ? `${matchInfo.livehomescore ?? 0}-${matchInfo.liveawayscore ?? 0}`
                : null

            const stat =
              gameType == GAME_TYPES.RUNNING
                ? getElapsedTime(matchInfo.livetimer, matchInfo.liveperiod, gameType)
                : null

            const isReversedType = [1, 7, 609].includes(matchInfo.parenttypeid)
            const hdp_point =
              matchInfo.hdp1 !== 0
                ? isReversedType
                  ? -matchInfo.hdp1
                  : matchInfo.hdp1
                : isReversedType
                  ? matchInfo.hdp2
                  : -matchInfo.hdp1

            const HDP = toPositiveNumber(Math.abs(hdp_point))

            const dateObj = new Date(Number(matchInfo.livetimer) * 1000)
            dateObj.setMinutes(dateObj.getMinutes() + 1)

            const date = dateObj.toLocaleDateString('en-US', {
              day: '2-digit',
              month: '2-digit'
            })

            const time = dateObj.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            })

            const dataSave = {
              gameType,
              date,
              time,
              platform: PLATFORM.VIVA88BET,
              idLeague: leagueid ?? matchInfo?.leagueid ?? '',
              nameLeague: findLeague?.nameLeague ?? matchInfo?.league ?? '',
              idEvent: matchInfo.matchid,
              nameHome: matchInfo.hteamnameen,
              nameAway: matchInfo.ateamnameen,
              targetType: getTargetTypeByParentId(matchInfo.parenttypeid, matchInfo.bettype),
              altLineId: matchInfo.oddsid,
              hdp_point,
              home_over: matchInfo.odds1a,
              away_under: matchInfo.odds2a,
              score,
              stat,
              typeOdd,
              type,
              bettype: matchInfo.bettype ?? '',
              HDP,
              specialOdd: null,
              league: findLeague?.league || '',
              home: matchInfo.home,
              away: matchInfo.away
            }

            const requiredFields = [
              'idLeague',
              'nameLeague',
              'idEvent',
              'nameHome',
              'nameAway',
              'altLineId',
              'hdp_point',
              'home_over',
              'away_under'
            ]

            const isComplete = requiredFields.every(
              (key) => dataSave[key] !== undefined && dataSave[key] !== null
            )

            if (isComplete) {
              records.push(dataSave)
              if (records.length >= BATCH_SIZE) {
                insertRecords(records, Viva88Bet)
              }
            }
          } else {
            const updateFields: Record<string, any> = {}

            const parenttypeid = findTicket.betType
            const hdpPoint = findTicket.hdp_point

            const isNegative = hdpPoint.toString().includes('-')
            const isMatchTypeId = [3, 8].includes(parenttypeid)

            if (matchInfo.hdp1 !== undefined && matchInfo.hdp2 !== undefined) {
              updateFields.hdp_point = !isMatchTypeId
                ? matchInfo.hdp1 !== 0
                  ? -matchInfo.hdp1
                  : matchInfo.hdp2
                : matchInfo.hdp1 !== 0
                  ? matchInfo.hdp1
                  : -matchInfo.hdp1
            }

            if (matchInfo.hdp1 !== undefined && matchInfo.hdp2 == undefined) {
              updateFields.hdp_point = isMatchTypeId
                ? matchInfo.hdp1
                : isNegative
                  ? -matchInfo.hdp1
                  : matchInfo.hdp1

              updateFields.HDP = toPositiveNumber(matchInfo.hdp1)
            }

            if (matchInfo.hdp1 == undefined && matchInfo.hdp2 != undefined) {
              updateFields.hdp_point = isMatchTypeId
                ? matchInfo.hdp2
                : isNegative
                  ? -matchInfo.hdp2
                  : matchInfo.hdp2

              updateFields.HDP = toPositiveNumber(matchInfo.hdp2)
            }

            if (matchInfo.odds1a !== undefined) {
              updateFields.home_over = matchInfo.odds1a
            }

            if (matchInfo.odds2a !== undefined) {
              updateFields.away_under = matchInfo.odds2a
            }

            if (Object.keys(updateFields).length > 0) {
              Viva88Bet.update({ id: findTicket.id }, updateFields)
            }
          }

          if (records.length > 0) {
            insertRecords(records, Viva88Bet)
          }
        }

        if (Array.isArray(row) && row[1] === '-o') {
          Viva88Bet.delete({
            altLineId: row[3]
          })
        }

        if (Array.isArray(row) && row[1] === '-m') {
          EventViva88.delete({
            idEvent: row[3]
          })
        }
      }
    } catch (error) {
      console.log(error)
    }
  }
}
function getElapsedTime(livetimer, liveperiod, isht) {
  if (livetimer == null || liveperiod == null) return ''

  // Halftime (nghỉ giữa Q2 và Q3)
  if (isht === 'HT') return 'HT'

  const now = Date.now()
  const kickoff = Number(livetimer) * 1000
  const diffMs = now - kickoff
  if (diffMs < 0) return ''

  const diffMinutes = Math.floor(diffMs / 60000)

  // Quarter max 10 phút
  const minutes = diffMinutes % 10

  if (liveperiod >= 1 && liveperiod <= 4) {
    return `Q${liveperiod} ${minutes}'`
  }

  // OT (hiệp phụ)
  const otNumber = liveperiod - 4
  return `OT${otNumber} ${minutes}'`
}

function insertRecords(records: any, Viva88Bet: Model) {
  Viva88Bet.insertMany(records)
  records.length = 0
}

function createReverseMap(obj: Record<string, number>): Record<number, string> {
  const reverse: Record<number, string> = {}
  for (const key in obj) {
    reverse[obj[key]] = key
  }
  return reverse
}
