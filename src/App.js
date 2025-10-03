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
  PauseOutlined, 
  EditOutlined, 
  MoreOutlined 
} from "@ant-design/icons";
import ImgCrop from "antd-img-crop";
import { supabase } from "./supabaseClient";


// === GENERATE PRODUCT ID ===
const generateProductID = (packageID, existingProducts) => {
  // Determine prefix based on category
  const prefix = packageID === '1' ? 'ST' : packageID === '2' ? 'SH' : 'PR';
  
  // Generate random alphanumeric string (4 chars)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomStr = '';
  for (let i = 0; i < 4; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  const baseID = `${prefix}${randomStr}`;
  
  // Check if this base ID already exists
  const existing = existingProducts.filter(p => p.id && p.id.startsWith(baseID));
  
  if (existing.length > 0) {
    // If exists, try again (recursive)
    return generateProductID(packageID, existingProducts);
  }
  
  return baseID;
};


const App = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [grammList, setGrammList] = useState([{ gramm: "", price: "", oldPrice: "" }]);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data: products, error: productError } = await supabase
        .from("product")
        .select("*")
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (productError) throw productError;

      const designIDs = [...new Set(products.map((p) => p.designID).filter(Boolean))];
      const { data: designs, error: designError } = await supabase
        .from("designs")
        .select("*")
        .in("id", designIDs);

      if (designError) throw designError;

      const designMap = {};
      designs.forEach((d) => { designMap[d.id] = d; });

      const merged = products.map((p) => ({ ...p, ...designMap[p.designID] }));
      setProducts(merged);
    } catch (err) {
      console.error("❌ fetchProducts error:", err);
      message.error("Ошибка загрузки: " + err.message);
    } finally {
      setLoading(false);
    }
  };

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
const uploadImageToSupabase = async (file, baseID, index) => {  // ← Changed parameter name
  try {
    console.log(`🔄 Uploading image ${index}:`, file.name);
    
    const fileExt = file.name.split(".").pop();
    const fileName = `${baseID}_${Date.now()}_${index}.${fileExt}`;  // ← Using baseID directly
    
    console.log(`📝 Filename: ${fileName}`);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("productPhotos")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      console.error("❌ Upload error:", uploadError);
      throw uploadError;
    }

    console.log("✅ Upload successful:", uploadData);

    const { data } = supabase.storage.from("productPhotos").getPublicUrl(fileName);
    console.log("📷 Public URL:", data.publicUrl);
    
    return data.publicUrl;
  } catch (error) {
    console.error("❌ uploadImageToSupabase error:", error);
    throw error;
  }
};

const handleAddProduct = async (values) => {
  setSaving(true);
  try {
    if (fileList.length === 0) {
      message.error("Загрузите хотя бы одно фото");
      setSaving(false);
      return;
    }

    // === VALIDATE GRAMM/PRICE FIRST ===
    const validGramms = grammList.filter(
      (g) => g.gramm && !isNaN(parseInt(g.gramm)) && g.price && !isNaN(parseFloat(g.price))
    );

    if (validGramms.length === 0) {
      message.error("Добавьте хотя бы один вес с ценой");
      setSaving(false);
      return;
    }

    // === GENERATE BASE ID EARLY ===
    const baseID = generateProductID(values.packageID, products);
    console.log("🆔 Generated base ID:", baseID);

    // === IMAGE UPLOAD (using baseID instead of product name) ===
    console.log("📤 Starting image upload process...");
    const imageUrls = {};
    for (let i = 0; i < fileList.length; i++) {
      if (fileList[i].originFileObj) {
        const url = await uploadImageToSupabase(
          fileList[i].originFileObj, 
          baseID,  // ← Changed from productName to baseID
          i + 1
        );
        imageUrls[`imageURL${i + 1}`] = url;
      } else if (fileList[i].url) {
        imageUrls[`imageURL${i + 1}`] = fileList[i].url;
      }
    }
    console.log("✅ All images uploaded:", imageUrls);

    // === CREATE DESIGN ===
    const productName = values.name;
    console.log("📦 Creating design...");
    const { data: designData, error: designError } = await supabase
      .from("designs")
      .insert({ name: productName, ...imageUrls })
      .select()
      .single();

    if (designError) {
      console.error("❌ Design creation error:", designError);
      throw designError;
    }
    console.log("✅ Design created:", designData);

    // === CREATE PRODUCTS ===
    console.log("🛍️ Creating products...");
    for (let i = 0; i < validGramms.length; i++) {
      const productID = `${baseID}-${String(i + 1).padStart(3, '0')}`;
      console.log(`📝 Creating product: ${productID}`);
      
      const { error: insertError } = await supabase.from("product").insert({
        id: productID,
        name: productName,
        packageID: values.packageID,
        gramm: parseInt(validGramms[i].gramm),
        designID: designData.id,
        price: parseFloat(validGramms[i].price),
        oldPrice: validGramms[i].oldPrice ? parseFloat(validGramms[i].oldPrice) : 0,
        description: values.description,
        measure_unit_one: "коробка",
        unit: "1000",
        measure_unit_few: "коробки",
        measure_unit_many: "коробок",
        status: "active",
      });

      if (insertError) {
        console.error(`❌ Product insert error for ${productID}:`, insertError);
        throw insertError;
      }
      
      console.log(`✅ Created product: ${productID}`);
    }

    console.log("✅ All products created successfully");
    message.success(`Успешно создано ${validGramms.length} вариант(ов) продукта с ID: ${baseID}-XXX`, 4);
    setAddModalVisible(false);
    form.resetFields();
    setFileList([]);
    setGrammList([{ gramm: "", price: "", oldPrice: "" }]);
    fetchProducts();
  } catch (err) {
    console.error("❌ handleAddProduct error:", err);
    message.error("Ошибка при создании продукта: " + err.message);
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
    // Extract base ID from editing product
    const baseID = editingProduct.id.substring(0, editingProduct.id.lastIndexOf('-'));
    const url = await uploadImageToSupabase(
      fileList[i].originFileObj,
      baseID,  // ← Use baseID instead of productName
      i + 1
    );
    imageUrls[`imageURL${i + 1}`] = url;
    hasNewImages = true;
  } else if (fileList[i].url) {
    imageUrls[`imageURL${i + 1}`] = fileList[i].url;
  }
}

    // Update design if name changed or new images
    // This affects ALL products with same designID
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

    // Extract base ID (remove the -001, -002 suffix)
    const baseID = editingProduct.id.substring(0, editingProduct.id.lastIndexOf('-'));
    console.log("🔄 Editing all products with base ID:", baseID);

    // Update ALL products with same base ID (except gramm and price)
    const updateData = {
      name: productName,
      packageID: values.packageID,
      description: values.description,
    };

    // Find all products with same base ID
    const { data: relatedProducts, error: fetchError } = await supabase
      .from("product")
      .select("id")
      .like("id", `${baseID}-%`);

    if (fetchError) throw fetchError;

    console.log("📦 Found related products:", relatedProducts.length);

    // Update each related product
    for (const prod of relatedProducts) {
      const { error: updateError } = await supabase
        .from("product")
        .update(updateData)
        .eq("id", prod.id);

      if (updateError) {
        console.error("❌ Update error for", prod.id, updateError);
        throw updateError;
      }
    }

    // Additionally update price for the specific product being edited
    if (grammList[0].price) {
      const { error: priceUpdateError } = await supabase
        .from("product")
        .update({
          price: parseFloat(grammList[0].price),
          oldPrice: grammList[0].oldPrice ? parseFloat(grammList[0].oldPrice) : 0,
        })
        .eq("id", editingProduct.id);

      if (priceUpdateError) throw priceUpdateError;
    }

    message.success(`Обновлено ${relatedProducts.length} связанных продукт(ов)!`);
    setAddModalVisible(false);
    setEditingProduct(null);
    form.resetFields();
    setFileList([]);
    setGrammList([{ gramm: "", price: "", oldPrice: "" }]);
    fetchProducts();
  } catch (err) {
    console.error("❌ handleEditProduct error:", err);
    message.error("Ошибка при обновлении: " + err.message);
  } finally {
    setSaving(false);
  }
};

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

  const openEditModal = (product) => {
    setEditingProduct(product);
    form.setFieldsValue({
      packageID: product.packageID,
      name: product.name,
      description: product.description,
    });

    setGrammList([{ gramm: product.gramm, price: product.price, oldPrice: product.oldPrice || "" }]);

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

  const viewProductDetails = (product) => {
    setSelectedProduct(product);
    setViewModalVisible(true);
  };

  const getProductImages = (product) => {
    const images = [];
    for (let i = 1; i <= 5; i++) {
      const imageUrl = product[`imageURL${i}`];
      if (imageUrl) images.push(imageUrl);
    }
    return images;
  };

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
        ) : "-";
      },
    },
    { title: "ID", dataIndex: "id", key: "id", width: 120 },
    { title: "Название", dataIndex: "name", key: "name", width: 200, render: (name) => name || "-" },
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
          <span style={{ fontWeight: "bold" }}>{price} сум</span>
          {record.oldPrice && record.oldPrice > 0 && (
            <span style={{ textDecoration: "line-through", color: "#999", fontSize: 12 }}>
              {record.oldPrice} сум
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
            <Button type="text" icon={<EyeOutlined />} onClick={() => viewProductDetails(record)} />
          </Tooltip>
          <Dropdown overlay={getActionMenu(record)} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

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
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Управление продуктами</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingProduct(null);
            setAddModalVisible(true);
            form.resetFields();
            setFileList([]);
            setGrammList([{ gramm: "", price: "", oldPrice: "" }]);
          }}
          size="large"
        >
          Добавить продукт
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={products}
        rowKey={(record) => record.id}
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `Всего: ${total} продуктов`,
        }}
      />

      <Modal
        title={
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            {editingProduct ? "Редактировать продукт" : "Создать продукт"}
          </div>
        }
        open={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false);
          setEditingProduct(null);
          form.resetFields();
          setFileList([]);
          setGrammList([{ gramm: "", price: "", oldPrice: "" }]);
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setAddModalVisible(false);
            setEditingProduct(null);
            form.resetFields();
            setFileList([]);
            setGrammList([{ gramm: "", price: "", oldPrice: "" }]);
          }}>
            Отмена
          </Button>,
          <Button key="submit" type="primary" loading={saving} onClick={() => form.submit()}>
            {editingProduct ? "Обновить" : "Создать"}
          </Button>,
        ]}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={editingProduct ? handleEditProduct : handleAddProduct}>
          <Form.Item name="packageID" label="Тип упаковки" rules={[{ required: true, message: "Выберите тип" }]}>
            <Select
              placeholder="Выберите тип упаковки"
              size="large"
              options={categories.map((cat) => ({ label: cat.name, value: cat.id }))}
            />
          </Form.Item>

          <Form.Item name="name" label="Название продукта" rules={[{ required: true, message: "Введите название" }]}>
            <Input placeholder="Название продукта" size="large" />
          </Form.Item>

          {!editingProduct && (
            <Form.Item label="Варианты веса и цены">
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                {grammList.map((item, index) => (
                  <Card key={index} size="small" style={{ backgroundColor: "#f5f5f5" }}>
                    <Space style={{ width: "100%", flexWrap: "wrap" }}>
                      <InputNumber
                        placeholder="Вес (г)"
                        value={item.gramm}
                        onChange={(val) => {
                          const newList = [...grammList];
                          newList[index].gramm = val;
                          setGrammList(newList);
                        }}
                        style={{ width: 120 }}
                        size="large"
                        min={1}
                        addonAfter="г"
                      />
                      <InputNumber
                        placeholder="Цена"
                        value={item.price}
                        onChange={(val) => {
                          const newList = [...grammList];
                          newList[index].price = val;
                          setGrammList(newList);
                        }}
                        style={{ width: 150 }}
                        size="large"
                        min={0}
                        addonAfter="сум"
                      />
                      <InputNumber
                        placeholder="Старая цена"
                        value={item.oldPrice}
                        onChange={(val) => {
                          const newList = [...grammList];
                          newList[index].oldPrice = val;
                          setGrammList(newList);
                        }}
                        style={{ width: 150 }}
                        size="large"
                        min={0}
                        addonAfter="сум"
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
                  </Card>
                ))}
                <Button
                  type="dashed"
                  onClick={() => setGrammList([...grammList, { gramm: "", price: "", oldPrice: "" }])}
                  block
                  size="large"
                >
                  + Добавить ещё вариант
                </Button>
              </Space>
            </Form.Item>
          )}

          {editingProduct && (
            <>
              <Form.Item label="Вес (граммы)">
                <InputNumber
                  value={grammList[0].gramm}
                  style={{ width: "100%" }}
                  size="large"
                  addonAfter="г"
                  disabled
                />
              </Form.Item>
              <Form.Item label="Цена">
                <InputNumber
                  value={grammList[0].price}
                  onChange={(val) => {
                    const newList = [...grammList];
                    newList[0].price = val;
                    setGrammList(newList);
                  }}
                  style={{ width: "100%" }}
                  size="large"
                  min={0}
                  addonAfter="сум"
                />
              </Form.Item>
              <Form.Item label="Зачеркнутая цена (необязательно)">
                <InputNumber
                  value={grammList[0].oldPrice}
                  onChange={(val) => {
                    const newList = [...grammList];
                    newList[0].oldPrice = val;
                    setGrammList(newList);
                  }}
                  style={{ width: "100%" }}
                  size="large"
                  min={0}
                  addonAfter="сум"
                />
              </Form.Item>
            </>
          )}

          <Form.Item name="description" label="Описание">
            <Input.TextArea placeholder="Описание продукта" rows={4} size="large" />
          </Form.Item>

          <Form.Item label="Фотографии (минимум 1)" required help={fileList.length === 0 && "Загрузите хотя бы одно фото"}>
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

      <Modal
        title="Детали продукта"
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={[<Button key="close" onClick={() => setViewModalVisible(false)}>Закрыть</Button>]}
        width={800}
      >
        {selectedProduct && (
          <div>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="ID" span={1}>{selectedProduct.id}</Descriptions.Item>
              <Descriptions.Item label="Название" span={1}>{selectedProduct.name}</Descriptions.Item>
              <Descriptions.Item label="Категория" span={1}>
                {categories.find(c => c.id === selectedProduct.packageID)?.name || selectedProduct.packageID}
              </Descriptions.Item>
              <Descriptions.Item label="Вес" span={1}>{selectedProduct.gramm}г</Descriptions.Item>
              <Descriptions.Item label="Цена" span={1}>
                <Space direction="vertical" size={0}>
                  <span style={{ fontWeight: "bold" }}>{selectedProduct.price} сум</span>
                  {selectedProduct.oldPrice && selectedProduct.oldPrice > 0 && (
                    <span style={{ textDecoration: "line-through", color: "#999" }}>
                      {selectedProduct.oldPrice} сум
                    </span>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Статус" span={1}>
                <Tag color={selectedProduct.status === "active" ? "green" : "orange"}>
                  {selectedProduct.status === "active" ? "Активен" : "Приостановлен"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Описание" span={2}>{selectedProduct.description || "—"}</Descriptions.Item>
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
                          preview={{ mask: <EyeOutlined /> }}
                        />
                      }
                    >
                      <div style={{ textAlign: "center", fontSize: 12, color: "#666" }}>Фото {index + 1}</div>
                    </Card>
                  </Col>
                ))}
              </Row>
              {getProductImages(selectedProduct).length === 0 && (
                <div style={{ textAlign: "center", color: "#999", padding: 20 }}>Нет фотографий</div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default App;