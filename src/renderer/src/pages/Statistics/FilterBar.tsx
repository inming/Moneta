import { Select, Radio, Space } from 'antd'
import type { TransactionType } from '../../../../shared/types/transaction'
import { TRANSACTION_TYPE_CONFIG } from '../../../../shared/constants/transaction-type'

interface FilterBarProps {
  year: number
  type: TransactionType
  minYear: number
  maxYear: number
  showYearFilter?: boolean
  onChange: (values: { year?: number; type?: TransactionType }) => void
}

export default function FilterBar({
  year, type, minYear, maxYear, showYearFilter = true, onChange
}: FilterBarProps): React.JSX.Element {
  const yearOptions = []
  for (let y = maxYear; y >= minYear; y--) {
    yearOptions.push({ value: y, label: `${y} 年` })
  }

  return (
    <Space size="middle" wrap>
      {showYearFilter && (
        <Select
          value={year}
          options={yearOptions}
          onChange={(v) => onChange({ year: v })}
          style={{ width: 120 }}
        />
      )}
      <Radio.Group
        value={type}
        onChange={(e) => onChange({ type: e.target.value as TransactionType })}
        optionType="button"
        buttonStyle="solid"
        options={Object.entries(TRANSACTION_TYPE_CONFIG).map(([key, cfg]) => ({
          value: key,
          label: cfg.label
        }))}
      />
    </Space>
  )
}
