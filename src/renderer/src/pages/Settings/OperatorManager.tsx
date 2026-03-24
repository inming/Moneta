import { useEffect, useState, useCallback, useRef } from 'react'
import { Table, Button, Modal, Form, Input, Space, Popconfirm, message } from 'antd'
import type { InputRef } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { Operator } from '@shared/types'
import { useTranslation } from 'react-i18next'

export default function OperatorManager(): React.JSX.Element {
  const { t } = useTranslation('settings')
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
        message.success(t('operatorManager.messages.updateSuccess'))
      } else {
        await window.api.operator.create(values.name)
        message.success(t('operatorManager.messages.createSuccess'))
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
      message.success(t('operatorManager.messages.deleteSuccess'))
      loadOperators()
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message)
      }
    }
  }

  const columns: ColumnsType<Operator> = [
    { title: t('operatorManager.columns.id'), dataIndex: 'id', width: 60 },
    { title: t('operatorManager.columns.name'), dataIndex: 'name', width: 150 },
    { title: t('operatorManager.columns.createdAt'), dataIndex: 'created_at' },
    {
      title: t('operatorManager.columns.actions'),
      width: 160,
      render: (_: unknown, record: Operator) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            {t('operatorManager.buttons.edit')}
          </Button>
          <Popconfirm
            title={t('operatorManager.deleteConfirm.title')}
            description={t('operatorManager.deleteConfirm.description')}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              {t('operatorManager.buttons.delete')}
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
          {t('operatorManager.buttons.add')}
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
        title={editingOperator ? t('operatorManager.modal.titleEdit') : t('operatorManager.modal.titleAdd')}
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
            label={t('operatorManager.modal.nameLabel')}
            rules={[{ required: true, message: t('operatorManager.modal.nameRequired') }]}
          >
            <Input ref={inputRef} placeholder={t('operatorManager.modal.namePlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
