import { useEffect, useState, useCallback } from 'react'
import { Table, Tabs, Tag, Typography } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { Transaction, TransactionType, Category, Operator, PaginatedResult } from '@shared/types'
import { TRANSACTION_TYPE_CONFIG } from '@shared/constants/transaction-type'

const { Text } = Typography

export default function Transactions(): React.JSX.Element {
  const [transactions, setTransactions] = useState<PaginatedResult<Transaction>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 50
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [loading, setLoading] = useState(false)

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]))
  const operatorMap = new Map(operators.map((o) => [o.id, o.name]))

  const loadTransactions = useCallback(async (page: number, pageSize: number) => {
    setLoading(true)
    try {
      const result = await window.api.transaction.list({ page, pageSize })
      setTransactions(result)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      window.api.transaction.list({ page: 1, pageSize: 50 }),
      window.api.category.list(),
      window.api.operator.list()
    ]).then(([txResult, cats, ops]) => {
      setTransactions(txResult)
      setCategories(cats)
      setOperators(ops)
    })
  }, [])

  const handleTableChange = (pagination: TablePaginationConfig): void => {
    loadTransactions(pagination.current ?? 1, pagination.pageSize ?? 50)
  }

  const txColumns: ColumnsType<Transaction> = [
    { title: '日期', dataIndex: 'date', width: 110 },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      render: (type: TransactionType) => (
        <Tag color={TRANSACTION_TYPE_CONFIG[type].color}>
          {TRANSACTION_TYPE_CONFIG[type].label}
        </Tag>
      )
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 100,
      align: 'right',
      render: (val: number) => val.toFixed(2)
    },
    {
      title: '分类',
      dataIndex: 'category_id',
      width: 100,
      render: (id: number) => categoryMap.get(id) ?? '-'
    },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    {
      title: '操作人',
      dataIndex: 'operator_id',
      width: 100,
      render: (id: number | null) => (id ? operatorMap.get(id) ?? '-' : '-')
    }
  ]

  const categoryColumns: ColumnsType<Category> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', width: 120 },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      render: (type: TransactionType) => (
        <Tag color={TRANSACTION_TYPE_CONFIG[type].tagColor}>
          {TRANSACTION_TYPE_CONFIG[type].label}
        </Tag>
      )
    },
    {
      title: '系统分类',
      dataIndex: 'is_system',
      width: 90,
      render: (val: boolean) => (val ? '是' : '否')
    },
    {
      title: '启用',
      dataIndex: 'is_active',
      width: 70,
      render: (val: boolean) => (val ? <Tag color="green">是</Tag> : <Tag color="red">否</Tag>)
    }
  ]

  const operatorColumns: ColumnsType<Operator> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', width: 150 },
    { title: '创建时间', dataIndex: 'created_at' }
  ]

  const tabItems = [
    {
      key: 'transactions',
      label: `交易记录 (${transactions.total})`,
      children: (
        <Table<Transaction>
          columns={txColumns}
          dataSource={transactions.items}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{
            current: transactions.page,
            pageSize: transactions.pageSize,
            total: transactions.total,
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100']
          }}
          onChange={handleTableChange}
        />
      )
    },
    {
      key: 'categories',
      label: `分类 (${categories.length})`,
      children: (
        <Table<Category>
          columns={categoryColumns}
          dataSource={categories}
          rowKey="id"
          size="small"
          pagination={false}
        />
      )
    },
    {
      key: 'operators',
      label: `操作人 (${operators.length})`,
      children: (
        <Table<Operator>
          columns={operatorColumns}
          dataSource={operators}
          rowKey="id"
          size="small"
          pagination={false}
        />
      )
    }
  ]

  return (
    <div>
      <Text strong style={{ fontSize: 18, display: 'block', marginBottom: 16 }}>
        数据浏览
      </Text>
      <Tabs items={tabItems} />
    </div>
  )
}
