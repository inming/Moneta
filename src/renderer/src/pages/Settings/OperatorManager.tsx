import { useEffect, useState, useCallback, useRef } from 'react'
import { Table, Button, Modal, Form, Input, Space, Popconfirm, message } from 'antd'
import type { InputRef } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { Operator } from '@shared/types'

export default function OperatorManager(): React.JSX.Element {
  const [operators, setOperators] = useState<Operator[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingOperator, setEditingOperator] = useState<Operator | null>(null)
  const [form] = Form.useForm()
  const inputRef = useRef<InputRef>(null)

  const loadOperators = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.api.operator.list()
      setOperators(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOperators()
  }, [loadOperators])

  const handleAdd = (): void => {
    setEditingOperator(null)
    form.resetFields()
    setModalOpen(true)
  }

  const handleEdit = (record: Operator): void => {
    setEditingOperator(record)
    form.setFieldsValue({ name: record.name })
    setModalOpen(true)
  }

  const handleModalOk = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      if (editingOperator) {
        await window.api.operator.update(editingOperator.id, values.name)
        message.success('操作人已更新')
      } else {
        await window.api.operator.create(values.name)
        message.success('操作人已创建')
      }
      setModalOpen(false)
      loadOperators()
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message)
      }
    }
  }

  const handleDelete = async (id: number): Promise<void> => {
    try {
      await window.api.operator.delete(id)
      message.success('操作人已删除')
      loadOperators()
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message)
      }
    }
  }

  const columns: ColumnsType<Operator> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', width: 150 },
    { title: '创建时间', dataIndex: 'created_at' },
    {
      title: '操作',
      width: 160,
      render: (_: unknown, record: Operator) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除该操作人？"
            description="已关联交易的操作人无法删除"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增操作人
        </Button>
      </div>

      <Table<Operator>
        columns={columns}
        dataSource={operators}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingOperator ? '编辑操作人' : '新增操作人'}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
        afterOpenChange={(open) => {
          if (open) {
            if (editingOperator) {
              form.setFieldsValue({ name: editingOperator.name })
            }
            setTimeout(() => inputRef.current?.focus(), 0)
          }
        }}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="操作人名称"
            rules={[{ required: true, message: '请输入操作人名称' }]}
          >
            <Input ref={inputRef} placeholder="请输入操作人名称" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
