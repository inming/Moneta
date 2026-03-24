import { useEffect, useState, useCallback, useRef } from 'react'
import { Table, Button, Modal, Form, Input, Tag, Space, Segmented, Popconfirm, message } from 'antd'
import type { InputRef } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { Category, TransactionType, CreateCategoryDTO, UpdateCategoryDTO } from '@shared/types'
import { TRANSACTION_TYPE_CONFIG } from '@shared/constants/transaction-type'
import { useTranslation } from 'react-i18next'

export default function CategoryManager(): React.JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeType, setActiveType] = useState<TransactionType>('expense')
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [form] = Form.useForm()
  const inputRef = useRef<InputRef>(null)

  // 交易类型选项（需要在组件内部定义以使用 t()）
  const typeOptions = Object.keys(TRANSACTION_TYPE_CONFIG).map((key) => ({
    label: t(`common:transactionTypes.${key}` as const),
    value: key
  }))

  const loadCategories = useCallback(async (type: TransactionType) => {
    setLoading(true)
    try {
      const data = await window.api.category.listAll(type)
      setCategories(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCategories(activeType)
  }, [activeType, loadCategories])

  const handleTypeChange = (value: string | number): void => {
    setActiveType(value as TransactionType)
  }

  const handleAdd = (): void => {
    setEditingCategory(null)
    form.resetFields()
    setModalOpen(true)
  }

  const handleEdit = (record: Category): void => {
    setEditingCategory(record)
    form.setFieldsValue({ name: record.name, description: record.description })
    setModalOpen(true)
  }

  const handleModalOk = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      if (editingCategory) {
        const dto: UpdateCategoryDTO = { name: values.name, description: values.description ?? '' }
        await window.api.category.update(editingCategory.id, dto)
        message.success(t('settings:categoryManager.messages.updateSuccess'))
      } else {
        const dto: CreateCategoryDTO = { name: values.name, type: activeType, description: values.description ?? '' }
        await window.api.category.create(dto)
        message.success(t('settings:categoryManager.messages.createSuccess'))
      }
      setModalOpen(false)
      loadCategories(activeType)
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message)
      }
    }
  }

  const handleDelete = async (id: number): Promise<void> => {
    try {
      const result = await window.api.category.delete(id)
      if (result.softDeleted) {
        message.info(t('settings:categoryManager.messages.softDeleted'))
      } else {
        message.success(t('settings:categoryManager.messages.deleteSuccess'))
      }
      loadCategories(activeType)
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message)
      }
    }
  }

  const handleToggleActive = async (record: Category): Promise<void> => {
    try {
      const dto: UpdateCategoryDTO = { is_active: !record.is_active }
      await window.api.category.update(record.id, dto)
      message.success(
        record.is_active
          ? t('settings:categoryManager.messages.disableSuccess')
          : t('settings:categoryManager.messages.enableSuccess')
      )
      loadCategories(activeType)
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message)
      }
    }
  }

  const handleMoveUp = async (index: number): Promise<void> => {
    if (index === 0) return
    const ids = categories.map((c) => c.id)
    ;[ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]
    await window.api.category.reorder(activeType, ids)
    loadCategories(activeType)
  }

  const handleMoveDown = async (index: number): Promise<void> => {
    if (index === categories.length - 1) return
    const ids = categories.map((c) => c.id)
    ;[ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]
    await window.api.category.reorder(activeType, ids)
    loadCategories(activeType)
  }

  const columns: ColumnsType<Category> = [
    {
      title: t('settings:categoryManager.columns.sort'),
      width: 80,
      render: (_: unknown, __: Category, index: number) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={index === 0}
            onClick={() => handleMoveUp(index)}
          />
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={index === categories.length - 1}
            onClick={() => handleMoveDown(index)}
          />
        </Space>
      )
    },
    { title: t('settings:categoryManager.columns.name'), dataIndex: 'name', width: 150 },
    {
      title: t('settings:categoryManager.columns.aiDescription'),
      dataIndex: 'description',
      ellipsis: true,
      render: (val: string) => val || <span style={{ color: '#bbb' }}>{t('settings:categoryManager.status.notSet')}</span>
    },
    {
      title: t('settings:categoryManager.columns.isSystem'),
      dataIndex: 'is_system',
      width: 90,
      render: (val: boolean) => (val ? t('settings:categoryManager.status.yes') : t('settings:categoryManager.status.no'))
    },
    {
      title: t('settings:categoryManager.columns.status'),
      dataIndex: 'is_active',
      width: 80,
      render: (val: boolean) => (
        val ? <Tag color="green">{t('settings:categoryManager.status.active')}</Tag> : <Tag color="red">{t('settings:categoryManager.status.inactive')}</Tag>
      )
    },
    {
      title: t('settings:categoryManager.columns.actions'),
      width: 240,
      render: (_: unknown, record: Category) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            {t('settings:categoryManager.buttons.edit')}
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handleToggleActive(record)}
          >
            {record.is_active ? t('settings:categoryManager.buttons.disable') : t('settings:categoryManager.buttons.enable')}
          </Button>
          <Popconfirm
            title={t('settings:categoryManager.deleteConfirm.title')}
            description={t('settings:categoryManager.deleteConfirm.description')}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              {t('settings:categoryManager.buttons.delete')}
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Segmented options={typeOptions} value={activeType} onChange={handleTypeChange} />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          {t('settings:categoryManager.buttons.add')}
        </Button>
      </div>

      <Table<Category>
        columns={columns}
        dataSource={categories}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
        rowClassName={(record) => (record.is_active ? '' : 'ant-table-row-disabled')}
      />

      <Modal
        title={editingCategory ? t('settings:categoryManager.modal.titleEdit') : t('settings:categoryManager.modal.titleAdd')}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
        afterOpenChange={(open) => {
          if (open) {
            if (editingCategory) {
              form.setFieldsValue({ name: editingCategory.name, description: editingCategory.description })
            }
            setTimeout(() => inputRef.current?.focus(), 0)
          }
        }}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label={t('settings:categoryManager.modal.nameLabel')}
            rules={[{ required: true, message: t('settings:categoryManager.modal.nameRequired') }]}
          >
            <Input ref={inputRef} placeholder={t('settings:categoryManager.modal.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('settings:categoryManager.modal.aiDescriptionLabel')}
            extra={t('settings:categoryManager.modal.aiDescriptionExtra')}
            rules={[{ max: 100, message: t('settings:categoryManager.modal.aiDescriptionMaxLength') }]}
          >
            <Input placeholder={t('settings:categoryManager.modal.aiDescriptionPlaceholder')} maxLength={100} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
