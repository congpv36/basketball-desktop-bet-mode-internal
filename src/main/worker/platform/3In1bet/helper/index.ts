import { TARGET_TYPE } from '@shared/common/constants'
import { AccountType } from '@shared/common/types'

export function buildPlatformUrl_3In1Bet(account: AccountType, type?: string) {
  const url = account.loginURL

  if (!type) return url

  const urlMap = {
    CHECK: `${url}check.aspx`,
    PROCESSLOGIN: `${url}main/processlogin.aspx`,
    MAIN_TOP_HEADER: `${url}main/topheader.aspx?lan=en-US`,
    USER_INFO_PANEL_HOST: `${url}member/betsview/UserInfoPanelHost.aspx?Ajax=1`,
    DATA_ODDS: `${url}Member/BetsView/BetLight/DataOdds.ashx`,
    SET_DATA: `${url}member/betsview/Bet.asmx/SetData`,
    BET_NOW: `${url}member/betsview/Bet.asmx/BetNow`,
    AR: `${url}member/betsview/data.asmx/sports/order/unify`
  }

  return urlMap[type] ?? url
}

export function buildHdpDoubleUrl(type: string, API_BASE_URL: string): string {
  return `${API_BASE_URL}Member/BetOdds/HdpDouble.aspx?v=1&m1=${type}&sports=S_&isHighlight=false`
}

export function createPayload(gameType) {
  const fcMap = {
    Early: '6',
    Today: '1',
    Running: '4'
  }

  return {
    fc: fcMap[gameType],
    m_accType: 'MY+MR',
    SystemLanguage: 'en-US',
    TimeFilter: '0',
    m_gameType: 'BB_',
    m_SortByTime: '0',
    m_LeagueList: '',
    SingleDouble: 'double',
    clientTime: '',
    c: 'A',
    fav: '',
    exlist: '0',
    keywords: '',
    m_sp: '0'
  }
}

export function isArError(res: unknown): res is { Au: number } {
  return typeof res === 'object' && res !== null && 'Au' in res
}

export function formatStat(text: string | null): string | null {
  if (text === null) return null
  if (text === 'HT') return 'HT'

  // Trường hợp có cộng thêm phút, ví dụ "1H 46+1"
  const extraMatch = text.match(/^(\d+)H\s*(\d+)\+(\d+)$/)
  if (extraMatch) {
    const hour = extraMatch[1]
    const minute = parseInt(extraMatch[2], 10)
    const extra = parseInt(extraMatch[3], 10)
    return `${hour}H ${minute + extra}'`
  }

  // Trường hợp bình thường: "1H 46"
  const match = text.match(/^(\d+)H\s*(\d+)$/)
  if (match) {
    return text + "'"
  }

  return text
}

export function normalizeLeagueName(text: string) {
  if (!text) return text

  // Regex bắt các kiểu "- 1ST QUARTER", "- 2ND QUARTER", ...
  const quarterPattern = /\s*-\s*(1ST|2ND|3RD|4TH)\s+QUARTER$/i

  if (quarterPattern.test(text)) {
    return text.split('-')[0].trim()
  }

  return text
}

export function normalizeTeamName(text: string) {
  if (!text) return text

  // Regex bắt các kiểu "(1st Quarter)" "(2nd Quarter)" ...
  const quarterPattern = /\((1st|2nd|3rd|4th)\s+Quarter\)$/i

  if (quarterPattern.test(text)) {
    return text.split('(')[0].trim()
  }

  return text
}

export function getTargetTypeByLeague(nameLeague: string, targetType: string) {
  const upperName = nameLeague.toUpperCase()

  if (upperName.includes('1ST QUARTER')) return TARGET_TYPE.FIRST_QUARTER
  if (upperName.includes('2ND QUARTER')) return TARGET_TYPE.SECOND_QUARTER
  if (upperName.includes('3RD QUARTER')) return TARGET_TYPE.THIRD_QUARTER
  if (upperName.includes('4TH QUARTER')) return TARGET_TYPE.FOURTH_QUARTER

  return targetType
}
