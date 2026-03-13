import { useEffect, useState, useCallback, useRef } from 'react'
import { Table, Button, Modal, Form, Input, Tag, Space, Segmented, Popconfirm, message } from 'antd'
import type { InputRef } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { Category, TransactionType, CreateCategoryDTO, UpdateCategoryDTO } from '@shared/types'
import { TRANSACTION_TYPE_CONFIG } from '@shared/constants/transaction-type'

const typeOptions = Object.entries(TRANSACTION_TYPE_CONFIG).map(([value, config]) => ({
  label: config.label,
  value
}))

export default function CategoryManager(): React.JSX.Element {
  const [categories, setCategories] = useState<Category[]>([])
  const [activeType, setActiveType] = useState<TransactionType>('expense')
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [form] = Form.useForm()
  const inputRef = useRef<InputRef>(null)

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
        message.success('分类已更新')
      } else {
        const dto: CreateCategoryDTO = { name: values.name, type: activeType, description: values.description ?? '' }
        await window.api.category.create(dto)
        message.success('分类已创建')
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
        message.info('该分类已关联交易记录，已标记为停用')
      } else {
        message.success('分类已删除')
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
      message.success(record.is_active ? '分类已停用' : '分类已启用')
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
      title: '排序',
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
    { title: '名称', dataIndex: 'name', width: 150 },
    {
      title: 'AI 描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (val: string) => val || <span style={{ color: '#bbb' }}>未设置</span>
    },
    {
      title: '系统分类',
      dataIndex: 'is_system',
      width: 90,
      render: (val: boolean) => (val ? '是' : '否')
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      width: 80,
      render: (val: boolean) => (
        val ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>
      )
    },
    {
      title: '操作',
      width: 200,
      render: (_: unknown, record: Category) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handleToggleActive(record)}
          >
            {record.is_active ? '停用' : '启用'}
          </Button>
          <Popconfirm
            title="确定删除该分类？"
            description="有关联交易时将标记为停用而非删除"
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Segmented options={typeOptions} value={activeType} onChange={handleTypeChange} />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增分类
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
        title={editingCategory ? '编辑分类' : '新增分类'}
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
            label="分类名称"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input ref={inputRef} placeholder="请输入分类名称" />
          </Form.Item>
          <Form.Item
            name="description"
            label="AI 描述"
            extra="辅助 AI 图片识别时进行分类匹配，如：外卖、堂食、食堂"
            rules={[{ max: 100, message: 'AI 描述不超过 100 字符' }]}
          >
            <Input placeholder="输入该分类的典型场景或关键词（选填）" maxLength={100} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
