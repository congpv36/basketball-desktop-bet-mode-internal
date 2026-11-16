import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@renderer/components/Common/Modal'

import { TicketInfoDataBetType } from '@shared/common/types'

export const InfoTicketSuccess = ({
  setShowInfoTicketSuccess,
  ticket
}: {
  setShowInfoTicketSuccess: Dispatch<SetStateAction<boolean>>
  ticket: TicketInfoDataBetType
}) => {
  const { t } = useTranslation('main')
  return (
    <Modal
      title={`[${ticket.company.split('-')[1]}] ${ticket.league} : ${ticket.nameHome} -vs- ${ticket.nameAway} `}
      onClose={() => setShowInfoTicketSuccess(false)}
    >
      <div className="pb-2 bg-layout-color rounded-b-2xl">
        <div className="p-2">
          <span>
            {`[${ticket.company.split('-')[1]}] ${ticket.league} : ${ticket.nameHome} -vs- ${ticket.nameAway} : ${ticket.bet} @${ticket.coverage}${(() => {
              if (ticket.bet === ticket.nameHome || ticket.bet === ticket.nameAway) return 'HDP'
              return 'OU'
            })()} ${ticket.hdp_point}, ${ticket.odd} `}
          </span>
          <div className="border border-white px-2 py-1">
            <div className="flex">
              <span className="w-36">{t('date')}</span>
              <span className="pr-2">:</span>
              <span>{ticket.time}</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('bet_date')}</span>
              <span className="pr-2">:</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('bet_date_time')}</span>
              <span className="pr-2">:</span>
              <span>2010/01/01 00:00:00</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('sports')}</span>
              <span className="pr-2">:</span>
              <span>Basketball</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('sportsbook_label')}</span>
              <span className="pr-2">:</span>
              <span>{ticket.platform}</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('username')}</span>
              <span className="pr-2">:</span>
              <span>{ticket.company.split('-')[1]}</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('home_odds')}</span>
              <span className="pr-2">:</span>
              <span>{ticket.home_over}</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('away_odds')}</span>
              <span className="pr-2">:</span>
              <span>{ticket.away_under}</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('amount_range')}</span>
              <span className="pr-2">:</span>
              <span>MYR6 - 988</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('game_type')}</span>
              <span className="pr-2">:</span>
              <span>{ticket.gameType}</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('odds_type')}</span>
              <span className="pr-2">:</span>
              <span>Malay</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('bet_target')}</span>
              <span className="pr-2">:</span>
              <span>
                {ticket.coverage}_
                {(() => {
                  if (ticket.bet === ticket.nameHome) return 'Home'
                  if (ticket.bet === ticket.nameAway) return 'Away'
                  return ticket.bet
                })()}
              </span>
            </div>
            <div className="flex">
              <span className="w-36">{t('running_coverage')}</span>
              <span className="pr-2">:</span>
              <span>{ticket.coverage}</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('receipt_id')}</span>
              <span className="pr-2">:</span>
              <span>{ticket.receiptID}</span>
            </div>
            <div className="flex">
              <span className="w-36">{t('receipt_status')}</span>
              <span className="pr-2">:</span>
              <span>{t('success')}</span>
            </div>
          </div>
        </div>
        <div
          className="border rounded-md border-gray-500 flex justify-center py-[1px] items-center mx-1 hover:border-blue-500 bg-white cursor-pointer"
          onClick={() => setShowInfoTicketSuccess(false)}
        >
          {t('ok')}
        </div>
      </div>
    </Modal>
  )
}
