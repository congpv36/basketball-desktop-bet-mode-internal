/* eslint-disable @typescript-eslint/no-explicit-any */
import https from 'https'

import { XMLParser } from 'fast-xml-parser'
import { HttpsProxyAgent } from 'https-proxy-agent'

import { SPREAD, TARGET_TYPE, TOTAL } from '@shared/common/constants'
import { AccountType } from '@shared/common/types'
import { OPTIONS_PROXY, TYPE_ODD } from '@shared/main/constants'

import { isProxyConfigValid } from '@/worker/lib/isProxyConfigValid'

const FINAL_URL = 'https://m407.mos077.com/'

export const SINGBET_VER = '7f61a85292d7ce95165d15c0bf1cd21f_1792043030050'

export const SINGBET_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'

export const SINGBET_BASE_COOKIE =
  'protocolstr=aHR0cHM=; loadBB=WQ==; test=aW5pdA; CookieChk=WQ; iorChgSw=WQ==; cu=Tg; cuipv6=Tg; ipv6=Tg'

export function buildPlatformUrl_SingBet(account: AccountType, type: string) {
  const isMosDomain = /^https:\/\/mos\d{3}\.com\/$/.test(account.loginURL)

  const baseUrl = isMosDomain ? FINAL_URL : account.loginURL

  const urlMap: Record<string, string> = {
    BASE: `${baseUrl}transform.php?ver=2026-01-05-rmbanner_132`,
    LOGIN: `${baseUrl}transform.php?ver=${SINGBET_VER}`
  }

  return urlMap[type] ?? baseUrl
}

export function convertXmlStringToJson(xmlString) {
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true
  }).parse(xmlString)
  return parsed?.serverresponse ?? null
}

export function formatOdds(input: string) {
  if (!input || !input.includes('/')) return input

  if (input.includes('/')) {
    return input
      .split('/')
      .map((v) => v.trim())
      .join('-')
  }

  return input.trim()
}

export function convertOdd(input: number): number {
  const value = input <= 1 ? input : input - 2
  return Math.floor(value * 100) / 100
}

function reverseConvertOdds(input: string): number {
  if (!input.includes('/')) {
    return Number(input)
  }

  const [a, b] = input.split('/').map((v) => parseFloat(v.trim()))

  if (isNaN(a) || isNaN(b)) {
    return 0
  }

  return (a + b) / 2
}

export function ratioValue(ratio: string, strongSide?: 'H' | 'C'): number {
  const value = reverseConvertOdds(ratio)
  if (!strongSide) {
    return value
  }

  return strongSide === 'H' ? -value : value
}

export const canPush = (ratio, home, away) => ratio !== '' && home != 0 && away != 0

export function handlePlay({ PLAY, event, base, isRunning, NOWSESSION, records }) {
  // ==========================
  // FULL TIME – HDP
  // ==========================
  const R = PLAY?.R
  if (R) {
    const ratioFT = isRunning ? R.RATIO_RE : R.RATIO_R
    const homeFT = isRunning ? R.IOR_REH : R.IOR_RH
    const awayFT = isRunning ? R.IOR_REC : R.IOR_RC

    if (canPush(ratioFT, homeFT, awayFT)) {
      const hdp_point = ratioValue(String(ratioFT), event.STRONG)
      if (hdp_point) {
        records.push({
          ...base,
          type: TYPE_ODD.HDP,
          typeOdd: SPREAD,
          altLineId: event.GID,
          targetType: TARGET_TYPE.FULL_TIME,
          home_over: convertOdd(+homeFT),
          away_under: convertOdd(+awayFT),
          hdp_point,
          HDP: formatOdds(String(ratioFT))
        })
      }
    }
  }

  // ==========================
  // HALF – HDP
  // ==========================
  const HALF_R = PLAY?.HALF_R
  if (HALF_R) {
    const ratio = isRunning ? HALF_R.HALF_RATIO_RE : HALF_R.HALF_RATIO_R
    const home = isRunning ? HALF_R.HALF_IOR_REH : HALF_R.HALF_IOR_RH
    const away = isRunning ? HALF_R.HALF_IOR_REC : HALF_R.HALF_IOR_RC

    if (canPush(ratio, home, away)) {
      const hdp_point = ratioValue(String(ratio), isRunning ? HALF_R.HALF_STRONG : event.STRONG)

      if (hdp_point) {
        const targetType =
          isRunning && ['Q3', 'Q4'].includes(NOWSESSION)
            ? TARGET_TYPE.SECOND_TIME
            : TARGET_TYPE.FIRST_TIME

        records.push({
          ...base,
          type: TYPE_ODD.HDP,
          typeOdd: SPREAD,
          altLineId: HALF_R.HALF_GID,
          targetType,
          home_over: convertOdd(+home),
          away_under: convertOdd(+away),
          hdp_point,
          HDP: formatOdds(String(ratio))
        })
      }
    }
  }

  // ==========================
  // FULL TIME – OU
  // ==========================
  const OU = PLAY?.OU
  if (OU) {
    const ratio = isRunning ? OU.RATIO_ROUU : OU.RATIO_OUU
    const home = isRunning ? OU.IOR_ROUC : OU.IOR_OUC
    const away = isRunning ? OU.IOR_ROUH : OU.IOR_OUH

    if (canPush(ratio, home, away)) {
      const hdp_point = ratioValue(String(ratio))
      if (hdp_point) {
        records.push({
          ...base,
          type: TYPE_ODD.OU,
          typeOdd: TOTAL,
          altLineId: event.GID,
          targetType: TARGET_TYPE.FULL_TIME,
          home_over: convertOdd(+home),
          away_under: convertOdd(+away),
          hdp_point,
          HDP: formatOdds(String(ratio))
        })
      }
    }
  }

  // ==========================
  // HALF – OU
  // ==========================
  const HALF_OU = PLAY?.HALF_OU
  if (HALF_OU) {
    const ratio = isRunning ? HALF_OU.HALF_RATIO_ROUU : HALF_OU.HALF_RATIO_OUU
    const home = isRunning ? HALF_OU.HALF_IOR_ROUC : HALF_OU.HALF_IOR_OUC
    const away = isRunning ? HALF_OU.HALF_IOR_ROUH : HALF_OU.HALF_IOR_OUH

    if (canPush(ratio, home, away)) {
      const hdp_point = ratioValue(String(ratio))
      if (hdp_point) {
        const targetType =
          isRunning && ['Q3', 'Q4'].includes(NOWSESSION)
            ? TARGET_TYPE.SECOND_TIME
            : TARGET_TYPE.FIRST_TIME

        records.push({
          ...base,
          type: TYPE_ODD.OU,
          typeOdd: TOTAL,
          altLineId: HALF_OU.HALF_GID,
          targetType,
          home_over: convertOdd(+home),
          away_under: convertOdd(+away),
          hdp_point,
          HDP: formatOdds(String(ratio))
        })
      }
    }
  }

  // ==========================
  // RUNNING – QUARTER
  // ==========================
  if (!isRunning) return

  const SESSION_TARGET_MAP: Record<string, string> = {
    '3': TARGET_TYPE.FIRST_QUARTER,
    '4': TARGET_TYPE.SECOND_QUARTER,
    '5': TARGET_TYPE.THIRD_QUARTER,
    '6': TARGET_TYPE.FOURTH_QUARTER
  }

  const MS_R = PLAY?.MS_R
  if (MS_R && canPush(MS_R.MS_RATIO_RE, MS_R.MS_IOR_REH, MS_R.MS_IOR_REC)) {
    const hdp_point = ratioValue(String(MS_R.MS_RATIO_RE), MS_R.MS_STRONG)
    if (hdp_point) {
      records.push({
        ...base,
        type: TYPE_ODD.HDP,
        typeOdd: SPREAD,
        altLineId: MS_R.MS_GID,
        targetType: SESSION_TARGET_MAP[MS_R.MS],
        home_over: convertOdd(+MS_R.MS_IOR_REH),
        away_under: convertOdd(+MS_R.MS_IOR_REC),
        hdp_point,
        HDP: formatOdds(String(MS_R.MS_RATIO_RE))
      })
    }
  }

  const MS_OU = PLAY?.MS_OU
  if (MS_OU && canPush(MS_OU.MS_RATIO_ROUU, MS_OU.MS_IOR_ROUC, MS_OU.MS_IOR_ROUH)) {
    const hdp_point = ratioValue(String(MS_OU.MS_RATIO_ROUU))
    if (hdp_point) {
      records.push({
        ...base,
        type: TYPE_ODD.OU,
        typeOdd: TOTAL,
        altLineId: MS_OU.MS_GID,
        targetType: SESSION_TARGET_MAP[MS_OU.MS],
        home_over: convertOdd(+MS_OU.MS_IOR_ROUC),
        away_under: convertOdd(+MS_OU.MS_IOR_ROUH),
        hdp_point,
        HDP: formatOdds(String(MS_OU.MS_RATIO_ROUU))
      })
    }
  }
}

export const fetchOptions = (account: AccountType, proxyAgent?: any) => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':
      'en-US,en;q=0.9,th;q=0.8,zh-CN;q=0.7,zh;q=0.6,ja;q=0.5,cs;q=0.4,zh-TW;q=0.3,ms;q=0.2',
    Origin: account.loginURL,
    Referer: `${account.loginURL}transform.php?ver=2026-01-05-rmbanner_132`,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    ...(account.customIP ? { 'X-Forwarded-For': account.customIP } : {})
  },
  ...(proxyAgent && { agent: proxyAgent })
})

export const getProxyAgent_SingBet = (account: AccountType) => {
  const { status, data } = isProxyConfigValid(account)
  if (!status || account.proxyScope === OPTIONS_PROXY.NONE) {
    return new https.Agent({ rejectUnauthorized: false })
  }

  const { newIpAddress, newPort, newUsername, newPassword } = data
  return new HttpsProxyAgent<string>(
    `http://${newUsername}:${newPassword}@${newIpAddress}:${newPort}`,
    {
      rejectUnauthorized: false
    }
  )
}

const SSL_ERROR_CODES = [
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID'
]

export const getSslErrorMessage_SingBet = (account: AccountType, error: any): string | null => {
  const errorCode = [error?.code, error?.cause?.code, error?.errno, error?.cause?.errno].find(
    Boolean
  )
  if (!SSL_ERROR_CODES.includes(errorCode)) return null

  const domain = account.loginURL.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return `Domain ${domain} has an invalid SSL certificate (${errorCode}). Please change Login URL to another domain.`
}
