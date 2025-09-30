// src/App.jsx
import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Upload, Space, Dropdown, message, Image, Tag, Tooltip } from 'antd';
import { PlusOutlined, EyeOutlined, MoreOutlined, EditOutlined, DeleteOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import ImgCrop from 'antd-img-crop';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const AdminPanel = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [grammList, setGrammList] = useState([{ value: '' }]);
  const [freeDeliveryOrder, setFreeDeliveryOrder] = useState(5);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product')
        .select(`*, designs(*)`)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      message.error('Ошибка загрузки: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      message.error('Ошибка загрузки категорий: ' + error.message);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  const generateProductId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const uploadImageToSupabase = async (file, productName, index) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${productName.replace(/\s+/g, '_')}_${Date.now()}_${index}.${fileExt}`;
      
      const { error } = await supabase.storage
        .from('productPhotos')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('productPhotos')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      throw error;
    }
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      if (fileList.length === 0) {
        message.error('Загрузите хотя бы одно фото');
        setLoading(false);
        return;
      }

      const baseId = modalMode === 'edit' ? selectedProduct.id.split('-')[0] : generateProductId();
      const productName = values.name;

      const imageUrls = {};
      for (let i = 0; i < fileList.length; i++) {
        if (fileList[i].originFileObj) {
          const url = await uploadImageToSupabase(fileList[i].originFileObj, productName, i + 1);
          imageUrls[`imageURL${i + 1}`] = url;
        } else if (fileList[i].url) {
          imageUrls[`imageURL${i + 1}`] = fileList[i].url;
        }
      }

      const gramms = grammList.map(g => parseInt(g.value)).filter(g => !isNaN(g));
      
      if (gramms.length === 0) {
        message.error('Добавьте хотя бы один вес');
        setLoading(false);
        return;
      }

      if (modalMode === 'edit') {
        const { error: productError } = await supabase
          .from('product')
          .update({
            name: productName,
            packageID: values.packageID,
            gramm: parseInt(values.gramm),
            price: values.price,
            oldPrice: values.oldPrice || null,
            description: values.description,
            measure_unit_one: 'коробка',
            measure_unit_few: 'коробки',
            measure_unit_many: 'коробок',
            unit: values.unit,
            ...imageUrls
          })
          .eq('id', selectedProduct.id);

        if (productError) throw productError;

        const { error: designError } = await supabase
          .from('designs')
          .update({ name: productName, ...imageUrls })
          .eq('id', selectedProduct.designID);

        if (designError) throw designError;

        message.success('Продукт обновлен');
      } else {
        for (let i = 0; i < gramms.length; i++) {
          const productId = `${baseId}-${String(i + 1).padStart(3, '0')}`;

          const { data: designData, error: designError } = await supabase
            .from('designs')
            .insert({ name: productName, ...imageUrls })
            .select()
            .single();

          if (designError) throw designError;

          const { error: productError } = await supabase
            .from('product')
            .insert({
              id: productId,
              name: productName,
              packageID: values.packageID,
              gramm: gramms[i],
              designID: designData.id,
              price: values.price,
              oldPrice: values.oldPrice || null,
              description: values.description,
              measure_unit_one: 'коробка',
              measure_unit_few: 'коробки',
              measure_unit_many: 'коробок',
              unit: values.unit,
              FreeDeliveryOrder: freeDeliveryOrder,
              status: 'active',
              ...imageUrls
            });

          if (productError) throw productError;
        }

        message.success(`Создано продуктов: ${gramms.length}`);
      }

      fetchProducts();
      handleModalClose();
    } catch (error) {
      message.error('Ошибка: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (product) => {
    try {
      const { error: trashError } = await supabase
        .from('trash')
        .insert({
          product_id: product.id,
          product_data: product,
          deleted_at: new Date().toISOString()
        });

      if (trashError) throw trashError;

      const { error: updateError } = await supabase
        .from('product')
        .update({ status: 'deleted' })
        .eq('id', product.id);

      if (updateError) throw updateError;

      message.success('Продукт перемещен в корзину');
      fetchProducts();
    } catch (error) {
      message.error('Ошибка удаления: ' + error.message);
    }
  };

  const handleTogglePause = async (product) => {
    try {
      const newStatus = product.status === 'active' ? 'paused' : 'active';
      const { error } = await supabase
        .from('product')
        .update({ status: newStatus })
        .eq('id', product.id);

      if (error) throw error;

      message.success(newStatus === 'paused' ? 'Продукт приостановлен' : 'Продукт активирован');
      fetchProducts();
    } catch (error) {
      message.error('Ошибка: ' + error.message);
    }
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setSelectedProduct(null);
    setFileList([]);
    setGrammList([{ value: '' }]);
    form.resetFields();
  };

  const handleCreate = () => {
    setModalMode('create');
    setSelectedProduct(null);
    form.resetFields();
    setFileList([]);
    setGrammList([{ value: '' }]);
    setModalVisible(true);
  };

  const handleView = (product) => {
    setModalMode('view');
    setSelectedProduct(product);
    
    const images = [];
    for (let i = 1; i <= 10; i++) {
      if (product[`imageURL${i}`]) {
        images.push({
          uid: i,
          name: `image${i}`,
          status: 'done',
          url: product[`imageURL${i}`]
        });
      }
    }
    setFileList(images);
    setModalVisible(true);
  };

  const handleEdit = (product) => {
    setModalMode('edit');
    setSelectedProduct(product);
    
    form.setFieldsValue({
      packageID: product.packageID,
      name: product.name,
      gramm: product.gramm,
      price: product.price,
      oldPrice: product.oldPrice,
      description: product.description,
      unit: product.unit
    });

    const images = [];
    for (let i = 1; i <= 10; i++) {
      if (product[`imageURL${i}`]) {
        images.push({
          uid: i,
          name: `image${i}`,
          status: 'done',
          url: product[`imageURL${i}`]
        });
      }
    }
    setFileList(images);
    setGrammList([{ value: product.gramm }]);
    setModalVisible(true);
  };

  const columns = [
    {
      title: 'Фото',
      dataIndex: 'imageURL1',
      key: 'image',
      width: 80,
      render: (url) => url ? <Image src={url} width={50} height={50} style={{ objectFit: 'cover', borderRadius: 4 }} /> : '-'
    },
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
    },
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: 'Категория',
      dataIndex: 'packageID',
      key: 'package',
      width: 120,
      render: (packageID) => {
        const cat = categories.find(c => c.id === packageID);
        return cat ? cat.name : packageID;
      }
    },
    {
      title: 'Вес',
      dataIndex: 'gramm',
      key: 'gramm',
      width: 80,
      render: (gramm) => `${gramm}г`
    },
    {
      title: 'Цена',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 'bold' }}>{price} ₽</span>
          {record.oldPrice && (
            <span style={{ textDecoration: 'line-through', color: '#999', fontSize: 12 }}>
              {record.oldPrice} ₽
            </span>
          )}
        </Space>
      )
    },
    {
      title: 'Единица',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : 'orange'}>
          {status === 'active' ? 'Активен' : 'Приостановлен'}
        </Tag>
      )
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Просмотр">
            <Button type="text" icon={<EyeOutlined />} onClick={() => handleView(record)} />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'edit',
                  icon: <EditOutlined />,
                  label: 'Редактировать',
                  onClick: () => handleEdit(record)
                },
                {
                  key: 'pause',
                  icon: record.status === 'active' ? <PauseCircleOutlined /> : <PlayCircleOutlined />,
                  label: record.status === 'active' ? 'Приостановить' : 'Активировать',
                  onClick: () => handleTogglePause(record)
                },
                {
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: 'Удалить',
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      title: 'Удалить продукт?',
                      content: 'Продукт будет перемещен в корзину',
                      okText: 'Удалить',
                      okType: 'danger',
                      cancelText: 'Отмена',
                      onOk: () => handleDelete(record)
                    });
                  }
                }
              ]
            }}
            trigger={['click']}
          >
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      )
    }
  ];

  const uploadProps = {
    listType: 'picture-card',
    fileList: fileList,
    beforeUpload: () => false,
    onChange: ({ fileList: newFileList }) => setFileList(newFileList),
    onRemove: (file) => {
      const index = fileList.indexOf(file);
      const newFileList = fileList.slice();
      newFileList.splice(index, 1);
      setFileList(newFileList);
    },
    disabled: modalMode === 'view'
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Управление продуктами</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} size="large">
          Добавить продукт
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={products}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `Всего: ${total} продуктов`
        }}
      />

      <Modal
        title={
          modalMode === 'create' ? 'Создать продукт' :
          modalMode === 'edit' ? 'Редактировать продукт' : 'Просмотр продукта'
        }
        open={modalVisible}
        onCancel={handleModalClose}
        footer={modalMode === 'view' ? [
          <Button key="close" onClick={handleModalClose}>Закрыть</Button>
        ] : [
          <Button key="cancel" onClick={handleModalClose}>Отмена</Button>,
          <Button key="submit" type="primary" loading={loading} onClick={() => form.submit()}>
            {modalMode === 'create' ? 'Создать' : 'Сохранить'}
          </Button>
        ]}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} disabled={modalMode === 'view'}>
          <Form.Item name="packageID" label="Тип упаковки" rules={[{ required: true, message: 'Выберите тип' }]}>
            <Select placeholder="Выберите тип упаковки" size="large">
              {categories.map(cat => (
                <Select.Option key={cat.id} value={cat.id}>{cat.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="name" label="Название продукта" rules={[{ required: true, message: 'Введите название' }]}>
            <Input placeholder="Название продукта" size="large" />
          </Form.Item>

          <Form.Item label="Вес (граммы)">
            {modalMode === 'edit' ? (
              <Form.Item name="gramm" noStyle rules={[{ required: true, message: 'Введите вес' }]}>
                <InputNumber placeholder="Вес в граммах" style={{ width: '100%' }} size="large" min={1} />
              </Form.Item>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {grammList.map((gramm, index) => (
                  <Space key={index} style={{ width: '100%' }}>
                    <InputNumber
                      placeholder="Вес в граммах"
                      value={gramm.value}
                      onChange={(val) => {
                        const newList = [...grammList];
                        newList[index].value = val;
                        setGrammList(newList);
                      }}
                      style={{ width: 200 }}
                      size="large"
                      min={1}
                    />
                    {grammList.length > 1 && (
                      <Button danger onClick={() => {
                        const newList = grammList.filter((_, i) => i !== index);
                        setGrammList(newList);
                      }}>
                        Удалить
                      </Button>
                    )}
                  </Space>
                ))}
                <Button type="dashed" onClick={() => setGrammList([...grammList, { value: '' }])} block>
                  + Добавить еще вес
                </Button>
              </Space>
            )}
          </Form.Item>

          <Form.Item name="price" label="Цена" rules={[{ required: true, message: 'Введите цену' }]}>
            <InputNumber placeholder="Цена" style={{ width: '100%' }} size="large" min={0} addonAfter="₽" />
          </Form.Item>

          <Form.Item name="oldPrice" label="Зачеркнутая цена (необязательно)">
            <InputNumber placeholder="Старая цена" style={{ width: '100%' }} size="large" min={0} addonAfter="₽" />
          </Form.Item>

          <Form.Item name="unit" label="Единица измерения" rules={[{ required: true, message: 'Введите единицу' }]}>
            <InputNumber placeholder="Количество" style={{ width: '100%' }} size="large" min={1} />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <Input.TextArea placeholder="Описание продукта" rows={4} size="large" />
          </Form.Item>

          <Form.Item label="Фотографии (минимум 1)" required help={fileList.length === 0 && "Загрузите хотя бы одно фото"}>
            <ImgCrop rotate>
              <Upload {...uploadProps}>
                {fileList.length < 5 && modalMode !== 'view' && (
                  <div>
                    <PlusOutlined />
                    <div style={{ marginTop: 8 }}>Загрузить</div>
                  </div>
                )}
              </Upload>
            </ImgCrop>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminPanel;