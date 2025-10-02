import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Space,
  Tag,
  Tooltip,
  message,
  Image,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Upload,
  Dropdown,
  Menu,
  Card,
  Row,
  Col,
  Descriptions,
} from "antd";
import { 
  PlusOutlined, 
  EyeOutlined, 
  DeleteOutlined, 
  PauseOutlined, 
  EditOutlined, 
  MoreOutlined 
} from "@ant-design/icons";
import ImgCrop from "antd-img-crop";
import { supabase } from "./supabaseClient";

const App = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [grammList, setGrammList] = useState([{ value: "" }]);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // === FETCH PRODUCTS ===
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data: products, error: productError } = await supabase
        .from("product")
        .select("*")
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (productError) throw productError;

      // join designs
      const designIDs = [...new Set(products.map((p) => p.designID).filter(Boolean))];
      const { data: designs, error: designError } = await supabase
        .from("designs")
        .select("*")
        .in("id", designIDs);

      if (designError) throw designError;

      const designMap = {};
      designs.forEach((d) => {
        designMap[d.id] = d;
      });

      const merged = products.map((p) => ({
        ...p,
        ...designMap[p.designID],
      }));

      setProducts(merged);
    } catch (err) {
      console.error("❌ fetchProducts error:", err);
      message.error("Ошибка загрузки: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // === FETCH CATEGORIES ===
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error("❌ fetchCategories error:", err);
      message.error("Ошибка загрузки категорий: " + err.message);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  // === UPLOAD IMAGE ===
  const uploadImageToSupabase = async (file, productName, index) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${productName.replace(/\s+/g, "_")}_${Date.now()}_${index}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("productPhotos")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("productPhotos").getPublicUrl(fileName);
    return data.publicUrl;
  };

  // === HANDLE ADD PRODUCT ===
  const handleAddProduct = async (values) => {
    setSaving(true);
    try {
      if (fileList.length === 0) {
        message.error("Загрузите хотя бы одно фото");
        setSaving(false);
        return;
      }

      const productName = values.name;

      // upload photos
      const imageUrls = {};
      for (let i = 0; i < fileList.length; i++) {
        if (fileList[i].originFileObj) {
          const url = await uploadImageToSupabase(
            fileList[i].originFileObj,
            productName,
            i + 1
          );
          imageUrls[`imageURL${i + 1}`] = url;
        } else if (fileList[i].url) {
          imageUrls[`imageURL${i + 1}`] = fileList[i].url;
        }
      }

      // gramms
      const gramms = grammList
        .map((g) => parseInt(g.value))
        .filter((g) => !isNaN(g));

      if (gramms.length === 0) {
        message.error("Добавьте хотя бы один вес");
        setSaving(false);
        return;
      }

      // create design
      const { data: designData, error: designError } = await supabase
        .from("designs")
        .insert({ name: productName, ...imageUrls })
        .select()
        .single();

      if (designError) throw designError;

      // create products
      for (let i = 0; i < gramms.length; i++) {
        const { error: insertError } = await supabase.from("product").insert({
          name: productName,
          packageID: values.packageID,
          gramm: gramms[i],
          designID: designData.id,
          price: values.price,
          oldPrice: values.oldPrice || null,
          description: values.description,
          measure_unit_one: "коробка",
          measure_unit_few: "коробки",
          measure_unit_many: "коробок",
          status: "active",
        });

        if (insertError) throw insertError;
      }

      message.success(`Создано продуктов: ${gramms.length}`);
      setAddModalVisible(false);
      form.resetFields();
      setFileList([]);
      setGrammList([{ value: "" }]);
      fetchProducts();
    } catch (err) {
      console.error("❌ handleAddProduct error:", err);
      message.error("Ошибка: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // === HANDLE EDIT PRODUCT ===
  const handleEditProduct = async (values) => {
    setSaving(true);
    try {
      if (!editingProduct) return;

      const productName = values.name;

      // Upload new photos if any
      const imageUrls = {};
      let hasNewImages = false;

      for (let i = 0; i < fileList.length; i++) {
        if (fileList[i].originFileObj) {
          const url = await uploadImageToSupabase(
            fileList[i].originFileObj,
            productName,
            i + 1
          );
          imageUrls[`imageURL${i + 1}`] = url;
          hasNewImages = true;
        } else if (fileList[i].url) {
          imageUrls[`imageURL${i + 1}`] = fileList[i].url;
        }
      }

      // Update design if name changed or new images
      if (hasNewImages || editingProduct.name !== productName) {
        const { error: designError } = await supabase
          .from("designs")
          .update({ 
            name: productName,
            ...(hasNewImages && imageUrls)
          })
          .eq("id", editingProduct.designID);

        if (designError) throw designError;
      }

      // Update product
      const { error: updateError } = await supabase
        .from("product")
        .update({
          name: productName,
          packageID: values.packageID,
          price: values.price,
          oldPrice: values.oldPrice || null,
          description: values.description,
        })
        .eq("id", editingProduct.id);

      if (updateError) throw updateError;

      message.success("Продукт успешно обновлен");
      setAddModalVisible(false);
      setEditingProduct(null);
      form.resetFields();
      setFileList([]);
      fetchProducts();
    } catch (err) {
      console.error("❌ handleEditProduct error:", err);
      message.error("Ошибка: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // === HANDLE PAUSE PRODUCT ===
  const handlePauseProduct = async (product) => {
    try {
      const { error } = await supabase
        .from("product")
        .update({ status: "paused" })
        .eq("id", product.id);

      if (error) throw error;

      message.success("Продукт приостановлен");
      fetchProducts();
    } catch (err) {
      console.error("❌ handlePauseProduct error:", err);
      message.error("Ошибка: " + err.message);
    }
  };

  // === OPEN EDIT MODAL ===
  const openEditModal = (product) => {
    setEditingProduct(product);
    
    // Prefill form
    form.setFieldsValue({
      packageID: product.packageID,
      name: product.name,
      price: product.price,
      oldPrice: product.oldPrice,
      description: product.description,
    });

    // Set gramm list
    setGrammList([{ value: product.gramm }]);

    // Set existing images
    const existingFiles = [];
    for (let i = 1; i <= 5; i++) {
      const imageUrl = product[`imageURL${i}`];
      if (imageUrl) {
        existingFiles.push({
          uid: `existing-${i}`,
          name: `image${i}.jpg`,
          status: 'done',
          url: imageUrl,
        });
      }
    }
    setFileList(existingFiles);

    setAddModalVisible(true);
  };

  // === VIEW PRODUCT DETAILS ===
  const viewProductDetails = (product) => {
    setSelectedProduct(product);
    setViewModalVisible(true);
  };

  // === GET PRODUCT IMAGES ===
  const getProductImages = (product) => {
    const images = [];
    for (let i = 1; i <= 5; i++) {
      const imageUrl = product[`imageURL${i}`];
      if (imageUrl) {
        images.push(imageUrl);
      }
    }
    return images;
  };

  // === DROPDOWN MENU ===
  const getActionMenu = (product) => (
    <Menu
      items={[
        {
          key: 'edit',
          label: 'Редактировать',
          icon: <EditOutlined />,
          onClick: () => openEditModal(product),
        },
        {
          key: 'pause',
          label: 'Приостановить',
          icon: <PauseOutlined />,
          onClick: () => handlePauseProduct(product),
        },
      ]}
    />
  );

  // === TABLE COLUMNS ===
  const columns = [
    {
      title: "Фото",
      dataIndex: "imageURL1",
      key: "image",
      width: 80,
      render: (url, record) => {
        const firstImg = url || record.imageURL2 || record.imageURL3 || null;
        return firstImg ? (
          <div style={{ width: 60, height: 60, overflow: "hidden", borderRadius: 4 }}>
            <Image src={firstImg} width={60} height={60} style={{ objectFit: "cover" }} preview={false} />
          </div>
        ) : (
          "-"
        );
      },
    },
    { title: "ID", dataIndex: "id", key: "id", width: 120 },
    { title: "Название", dataIndex: "name", key: "name", width: 200 },
    {
      title: "Категория",
      dataIndex: "packageID",
      key: "package",
      width: 120,
      render: (packageID) => {
        const cat = categories.find((c) => c.id === packageID);
        return cat ? cat.name : packageID;
      },
    },
    {
      title: "Вес",
      dataIndex: "gramm",
      key: "gramm",
      width: 80,
      render: (gramm) => `${gramm}г`,
    },
    {
      title: "Цена",
      dataIndex: "price",
      key: "price",
      width: 100,
      render: (price, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: "bold" }}>{price} ₽</span>
          {record.oldPrice && (
            <span style={{ textDecoration: "line-through", color: "#999", fontSize: 12 }}>
              {record.oldPrice} ₽
            </span>
          )}
        </Space>
      ),
    },
    {
      title: "Статус",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status) => (
        <Tag color={status === "active" ? "green" : status === "paused" ? "orange" : "red"}>
          {status === "active" ? "Активен" : status === "paused" ? "Приостановлен" : "Удален"}
        </Tag>
      ),
    },
    {
      title: "Действия",
      key: "actions",
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Просмотреть детали">
            <Button 
              type="text" 
              icon={<EyeOutlined />} 
              onClick={() => viewProductDetails(record)}
            />
          </Tooltip>
          <Dropdown overlay={getActionMenu(record)} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  // === UPLOAD PROPS ===
  const uploadProps = {
    listType: "picture-card",
    fileList,
    beforeUpload: () => false,
    onChange: ({ fileList: newFileList }) => setFileList(newFileList),
    onRemove: (file) => {
      const index = fileList.indexOf(file);
      const newFileList = fileList.slice();
      newFileList.splice(index, 1);
      setFileList(newFileList);
    },
  };

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0 }}>Управление продуктами</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingProduct(null);
            setAddModalVisible(true);
            form.resetFields();
            setFileList([]);
            setGrammList([{ value: "" }]);
          }}
          size="large"
        >
          Добавить продукт
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={products}
        rowKey={(record) => record.id + "_" + record.gramm}
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `Всего: ${total} продуктов`,
        }}
      />

      {/* === ADD/EDIT PRODUCT MODAL === */}
      <Modal
        title={editingProduct ? "Редактировать продукт" : "Создать продукт"}
        open={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false);
          setEditingProduct(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setAddModalVisible(false);
            setEditingProduct(null);
          }}>
            Отмена
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={saving}
            onClick={() => form.submit()}
          >
            {editingProduct ? "Обновить" : "Создать"}
          </Button>,
        ]}
        width={800}
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={editingProduct ? handleEditProduct : handleAddProduct}
        >
          <Form.Item
            name="packageID"
            label="Тип упаковки"
            rules={[{ required: true, message: "Выберите тип" }]}
          >
            <Select
              placeholder="Выберите тип упаковки"
              size="large"
              options={categories.map((cat) => ({
                label: cat.name,
                value: cat.id,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="Название продукта"
            rules={[{ required: true, message: "Введите название" }]}
          >
            <Input placeholder="Название продукта" size="large" />
          </Form.Item>

          {!editingProduct && (
            <Form.Item label="Вес (граммы)">
              <Space direction="vertical" style={{ width: "100%" }}>
                {grammList.map((gramm, index) => (
                  <Space key={index} style={{ width: "100%" }}>
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
                      <Button
                        danger
                        onClick={() => {
                          const newList = grammList.filter((_, i) => i !== index);
                          setGrammList(newList);
                        }}
                      >
                        Удалить
                      </Button>
                    )}
                  </Space>
                ))}
                <Button
                  type="dashed"
                  onClick={() => setGrammList([...grammList, { value: "" }])}
                  block
                >
                  + Добавить ещё вес
                </Button>
              </Space>
            </Form.Item>
          )}

          <Form.Item
            name="price"
            label="Цена"
            rules={[{ required: true, message: "Введите цену" }]}
          >
            <InputNumber
              placeholder="Цена"
              style={{ width: "100%" }}
              size="large"
              min={0}
              addonAfter="₽"
            />
          </Form.Item>

          <Form.Item name="oldPrice" label="Зачеркнутая цена (необязательно)">
            <InputNumber
              placeholder="Старая цена"
              style={{ width: "100%" }}
              size="large"
              min={0}
              addonAfter="₽"
            />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <Input.TextArea placeholder="Описание продукта" rows={4} size="large" />
          </Form.Item>

          <Form.Item
            label="Фотографии (минимум 1)"
            required
            help={fileList.length === 0 && "Загрузите хотя бы одно фото"}
          >
            <ImgCrop rotate>
              <Upload {...uploadProps}>
                {fileList.length < 5 && (
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

      {/* === VIEW PRODUCT DETAILS MODAL === */}
      <Modal
        title="Детали продукта"
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setViewModalVisible(false)}>
            Закрыть
          </Button>,
        ]}
        width={800}
      >
        {selectedProduct && (
          <div>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="ID" span={1}>
                {selectedProduct.id}
              </Descriptions.Item>
              <Descriptions.Item label="Название" span={1}>
                {selectedProduct.name}
              </Descriptions.Item>
              <Descriptions.Item label="Категория" span={1}>
                {categories.find(c => c.id === selectedProduct.packageID)?.name || selectedProduct.packageID}
              </Descriptions.Item>
              <Descriptions.Item label="Вес" span={1}>
                {selectedProduct.gramm}г
              </Descriptions.Item>
              <Descriptions.Item label="Цена" span={1}>
                <Space direction="vertical" size={0}>
                  <span style={{ fontWeight: "bold" }}>{selectedProduct.price} ₽</span>
                  {selectedProduct.oldPrice && (
                    <span style={{ textDecoration: "line-through", color: "#999" }}>
                      {selectedProduct.oldPrice} ₽
                    </span>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Статус" span={1}>
                <Tag color={selectedProduct.status === "active" ? "green" : "orange"}>
                  {selectedProduct.status === "active" ? "Активен" : "Приостановлен"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Описание" span={2}>
                {selectedProduct.description || "—"}
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 24 }}>
              <h4>Фотографии</h4>
              <Row gutter={[16, 16]}>
                {getProductImages(selectedProduct).map((image, index) => (
                  <Col span={8} key={index}>
                    <Card
                      hoverable
                      bodyStyle={{ padding: 8 }}
                      cover={
                        <Image
                          src={image}
                          alt={`Фото ${index + 1}`}
                          style={{ height: 120, objectFit: "cover" }}
                          preview={{
                            mask: <EyeOutlined />,
                          }}
                        />
                      }
                    >
                      <div style={{ textAlign: "center", fontSize: 12, color: "#666" }}>
                        Фото {index + 1}
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
              {getProductImages(selectedProduct).length === 0 && (
                <div style={{ textAlign: "center", color: "#999", padding: 20 }}>
                  Нет фотографий
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default App;