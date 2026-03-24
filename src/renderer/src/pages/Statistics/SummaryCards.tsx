import { Card, Col, Row, Statistic } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { SummaryData } from '../../../../shared/types'

interface SummaryCardsProps {
  data: SummaryData | null
  month: number
}

export default function SummaryCards({ data, month }: SummaryCardsProps): React.JSX.Element {
  const { t } = useTranslation('statistics')

  if (!data) {
    return <div />
  }

  const { currentMonth, lastMonth, yearTotal } = data

  // 环比变化
  const change = lastMonth > 0 ? ((currentMonth - lastMonth) / lastMonth) * 100 : 0
  const hasChange = lastMonth > 0

  return (
    <Row gutter={16}>
      <Col span={8}>
        <Card size="small">
          <Statistic
            title={t('summary.monthTotal', { month })}
            value={currentMonth}
            precision={2}
            prefix="¥"
          />
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small">
          <Statistic
            title={t('summary.monthOverMonth')}
            value={hasChange ? Math.abs(change) : undefined}
            precision={1}
            suffix={hasChange ? '%' : undefined}
            formatter={hasChange ? undefined : () => '—'}
            valueStyle={
              hasChange
                ? { color: change > 0 ? '#cf1322' : '#3f8600' }
                : undefined
            }
            prefix={
              hasChange
                ? change > 0
                  ? <ArrowUpOutlined />
                  : change < 0
                    ? <ArrowDownOutlined />
                    : undefined
                : undefined
            }
          />
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small">
          <Statistic
            title={t('summary.yearTotal')}
            value={yearTotal}
            precision={2}
            prefix="¥"
          />
        </Card>
      </Col>
    </Row>
  )
}
