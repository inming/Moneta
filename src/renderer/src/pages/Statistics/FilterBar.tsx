import { Select, Radio, Space } from 'antd'
import type { TransactionType } from '../../../../shared/types/transaction'
import type { Operator } from '../../../../shared/types'
import { TRANSACTION_TYPE_CONFIG } from '../../../../shared/constants/transaction-type'

interface FilterBarProps {
  year: number
  type: TransactionType
  operatorId: number | undefined
  minYear: number
  maxYear: number
  operators: Operator[]
  onChange: (values: { year?: number; type?: TransactionType; operatorId?: number | undefined }) => void
}

export default function FilterBar({
  year, type, operatorId, minYear, maxYear, operators, onChange
}: FilterBarProps): React.JSX.Element {
  const yearOptions = []
  for (let y = maxYear; y >= minYear; y--) {
    yearOptions.push({ value: y, label: `${y} 年` })
  }

  return (
    <Space size="middle" wrap>
      <Select
        value={year}
        options={yearOptions}
        onChange={(v) => onChange({ year: v })}
        style={{ width: 120 }}
      />
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
      <Select
        value={operatorId}
        onChange={(v) => onChange({ operatorId: v })}
        allowClear
        placeholder="全部操作人"
        style={{ width: 140 }}
        options={operators.map((op) => ({ value: op.id, label: op.name }))}
      />
    </Space>
  )
}
