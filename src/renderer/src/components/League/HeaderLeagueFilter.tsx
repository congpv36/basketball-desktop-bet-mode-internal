import React, { useContext } from 'react'
import { useTranslation } from 'react-i18next'

import { LeagueFilterContext } from '@renderer/context/LeagueFilterContext'

const HeaderLeagueFilter = () => {
  const { t } = useTranslation('main')
  const context = useContext(LeagueFilterContext)
  if (!context) return null

  const { filterType } = context.filterType

  return (
    <div
      className={`text-xl font-semibold text-center py-1 bg-white ${filterType == 'Block' ? 'text-[#FF0000]' : 'text-blue-color'}`}
    >
      {filterType == 'Block' ? t('blocked_league') : t('allowed_league')}
    </div>
  )
}

export default React.memo(HeaderLeagueFilter)
