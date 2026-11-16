import { GAME_TYPES } from '@shared/common/constants'

export const GAME_TYPE_SHOW_TYPE = {
  [GAME_TYPES.EARLY]: 'early',
  [GAME_TYPES.TODAY]: 'today',
  [GAME_TYPES.RUNNING]: 'live'
}

export const GAME_TYPE_R_TYPE = {
  [GAME_TYPES.EARLY]: 'r',
  [GAME_TYPES.TODAY]: 'r',
  [GAME_TYPES.RUNNING]: 'rb'
}

export const GAME_TYPE_FILTER = {
  [GAME_TYPES.EARLY]: '',
  [GAME_TYPES.TODAY]: 'FT',
  [GAME_TYPES.RUNNING]: ''
}
