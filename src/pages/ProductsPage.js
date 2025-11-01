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
  MoreOutlined,
  DeleteOutlined
} from "@ant-design/icons";
import ImgCrop from "antd-img-crop";
import { supabase } from "../supabaseClient"


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


const ProductsPage = () => {
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

      // ✅ фикс: не перезаписываем product.id, кладем данные дизайна в отдельное поле
      const merged = products.map((p) => ({
        ...p,
        design: designMap[p.designID] || {},
      }));

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
  console.log("🔍 handleEditProduct values:", values);
  setSaving(true);
  try {
    if (!editingProduct) {
      console.warn("No editingProduct set");
      setSaving(false);
      return;
    }

    const productName = values.name;
    const baseID = editingProduct.id.substring(0, editingProduct.id.lastIndexOf('-'));

    // 1) Получаем все существующие продукты для baseID (id и gramm)
    const { data: existingProducts = [], error: fetchError } = await supabase
      .from("product")
      .select("id, gramm")
      .like("id", `${baseID}-%`);

    if (fetchError) throw fetchError;

    // map gramm -> id и вычисляем максимальный суффикс для генерации новых id
    const existingMap = {};
    let maxSuffix = 0;
    existingProducts.forEach((p) => {
      existingMap[Number(p.gramm)] = p.id;
      const parts = String(p.id).split("-");
      const suffix = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(suffix) && suffix > maxSuffix) maxSuffix = suffix;
    });

    // 2) Работа с изображениями — загрузка новых и сбор imageURL*
    const imageUrls = {};
    let hasNewImages = false;
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (f.originFileObj) {
        // используем твою функцию загрузки
        const url = await uploadImageToSupabase(f.originFileObj, baseID, i + 1);
        imageUrls[`imageURL${i + 1}`] = url;
        hasNewImages = true;
      } else if (f.url) {
        imageUrls[`imageURL${i + 1}`] = f.url;
      }
    }

    // 3) Обновляем запись в designs если поменялось имя или есть новые картинки
    if (hasNewImages || editingProduct.name !== productName) {
      const { error: designError } = await supabase
        .from("designs")
        .update({
          name: productName,
          ...(hasNewImages ? imageUrls : {}),
        })
        .eq("id", editingProduct.designID);

      if (designError) throw designError;
    }

    // 4) Обновляем общие поля (name, packageID, description) у всех связанных продуктов
    const updateData = {
      name: productName,
      packageID: values.packageID,
      description: values.description !== undefined ? values.description : editingProduct.description,
    };

    const { data: relatedProducts = [], error: relatedFetchError } = await supabase
      .from("product")
      .select("id")
      .like("id", `${baseID}-%`);

    if (relatedFetchError) throw relatedFetchError;

    for (const prod of relatedProducts) {
      const { error: updErr } = await supabase
        .from("product")
        .update(updateData)
        .eq("id", prod.id);

      if (updErr) throw updErr;
    }

    // 5) Обновляем цены для существующих gramm и создаём новые продукты для новых gramm
    let createdCount = 0;
    for (const g of grammList) {
      const grammNum = Number(g.gramm);
      // если такой gramm уже был — обновим цену/oldPrice
      if (existingMap[grammNum]) {
        const { error: priceErr } = await supabase
          .from("product")
          .update({
            price: parseFloat(g.price),
            oldPrice: g.oldPrice ? parseFloat(g.oldPrice) : 0,
          })
          .eq("id", existingMap[grammNum]);

        if (priceErr) throw priceErr;
      } else {
        // новый gramm — создаём новый продукт
        if (g.gramm && g.price) {
          maxSuffix++;
          const productID = `${baseID}-${String(maxSuffix).padStart(3, "0")}`;

          const { error: insertError } = await supabase.from("product").insert({
            id: productID,
            name: productName,
            packageID: values.packageID,
            gramm: grammNum,
            designID: editingProduct.designID,
            price: parseFloat(g.price),
            oldPrice: g.oldPrice ? parseFloat(g.oldPrice) : 0,
            description: values.description,
            measure_unit_one: "коробка",
            unit: "1000",
            measure_unit_few: "коробки",
            measure_unit_many: "коробок",
            status: "active",
          });

          if (insertError) throw insertError;
          createdCount++;
        }
      }
    }

    message.success(`Обновлено ${relatedProducts.length} записей. Создано ${createdCount} новых вариантов.`);
    // закрываем модалку (в твоём коде используется addModalVisible/ setAddModalVisible)
    setAddModalVisible(false);
    setEditingProduct(null);
    form.resetFields();
    setFileList([]);
    setGrammList([{ gramm: "", price: "", oldPrice: "" }]);
    await fetchProducts();
  } catch (err) {
    console.error("❌ handleEditProduct error:", err);
    message.error("Ошибка при обновлении: " + (err?.message || err));
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


  // === HANDLE DELETE PRODUCT ===
const handleDeleteProduct = async (product) => {
  try {
    const { error } = await supabase
      .from("product")
      .update({ status: "deleted" })
      .eq("id", product.id);

    if (error) throw error;

    message.success("Продукт удален");
    fetchProducts();
  } catch (err) {
    console.error("❌ handleDeleteProduct error:", err);
    message.error("Ошибка при удалении: " + err.message);
  }
};

 const openEditModal = (product) => {
  setEditingProduct(product);

  // Заполняем форму
  form.setFieldsValue({
    packageID: product.packageID,
    name: product.name,
    description: product.description,
  });

  // Подставляем граммы и цену
  setGrammList([{
    gramm: product.gramm,
    price: product.price,
    oldPrice: product.oldPrice || ""
  }]);

  // Подставляем картинки из design.*
  const existingFiles = [];
  if (product.design) {
    for (let i = 1; i <= 5; i++) {
      const imageUrl = product.design[`imageURL${i}`];
      if (imageUrl) {
        existingFiles.push({
          uid: `existing-${i}`,
          name: `image${i}.jpg`,
          status: "done",
          url: imageUrl,
        });
      }
    }
  }

  setFileList(existingFiles);

  // Открываем модалку
  setAddModalVisible(true);
};


  const viewProductDetails = (product) => {
    setSelectedProduct(product);
    setViewModalVisible(true);
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
      // === ADD DELETE OPTION ===
      {
        key: 'delete',
        label: 'Удалить',
        icon: <DeleteOutlined />, // You'll need to import this
        onClick: () => handleDeleteProduct(product),
        danger: true, // This makes the text red
      },
    ]}
  />
);



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
      columns={[
        {
          title: "Фото",
          key: "image",
          width: 80,
          render: (_, record) => {
            const firstImg =
              record.design?.imageURL1 ||
              record.design?.imageURL2 ||
              record.design?.imageURL3 ||
              null;
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
          fixed: "right",
          render: (_, record) => (
            <Space size="small">
              <Tooltip title="Просмотреть детали">
                <Button type="text" icon={<EyeOutlined />} onClick={() => viewProductDetails(record)} />
              </Tooltip>
              <Dropdown overlay={getActionMenu(record)} trigger={["click"]}>
                <Button type="text" icon={<MoreOutlined />} />
              </Dropdown>
            </Space>
          ),
        },
      ]}
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

    {/* --- Модалка добавления/редактирования --- */}
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
    <Button
      key="cancel"
      onClick={() => {
        setAddModalVisible(false);
        setEditingProduct(null);
        form.resetFields();
        setFileList([]);
        setGrammList([{ gramm: "", price: "", oldPrice: "" }]);
      }}
    >
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
  destroyOnClose
>
  <Form
    form={form}
    layout="vertical"
    onFinish={editingProduct ? handleEditProduct : handleAddProduct}
    initialValues={
      editingProduct
        ? {
            packageID: editingProduct.packageID,
            name: editingProduct.name,
            description: editingProduct.description,
          }
        : {}
    }
  >
    <Form.Item
      name="packageID"
      label="Тип упаковки"
      rules={[{ required: true, message: "Выберите тип" }]}
    >
      <Select
        placeholder="Выберите тип упаковки"
        size="large"
        options={categories.map((cat) => ({ label: cat.name, value: cat.id }))}
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
      <Form.Item label="Варианты веса и цены">
        <Form.Item label="Варианты веса и цены">
    {grammList.map((g, idx) => (
      <Space key={idx} align="end" style={{ display: "flex", marginBottom: 8 }}>
        <InputNumber
          value={g.gramm}
          onChange={(val) => {
            const newList = [...grammList];
            newList[idx].gramm = val;
            setGrammList(newList);
          }}
          style={{ width: "120px" }}
          placeholder="Вес"
          addonAfter="г"
          min={1}
        />
        <InputNumber
          value={g.price}
          onChange={(val) => {
            const newList = [...grammList];
            newList[idx].price = val;
            setGrammList(newList);
          }}
          style={{ width: "150px" }}
          placeholder="Цена"
          addonAfter="сум"
          min={0}
        />
        <InputNumber
          value={g.oldPrice}
          onChange={(val) => {
            const newList = [...grammList];
            newList[idx].oldPrice = val;
            setGrammList(newList);
          }}
          style={{ width: "150px" }}
          placeholder="Старая цена"
          addonAfter="сум"
          min={0}
        />
        {grammList.length > 1 && (
          <Button 
            danger 
            onClick={() => setGrammList(grammList.filter((_, i) => i !== idx))}
          >
            Удалить
          </Button>
        )}
      </Space>
    ))}

    <Button
      type="primary"
      ghost
      onClick={() =>
        setGrammList([
          ...grammList,
          { gramm: "", price: "", oldPrice: "" },
        ])
      }
      style={{
        display: "block",
        width: "30%",
        height: "42px",
        borderRadius: "18px", 
        margin: "26px auto 0",
      }}
    >
      + Добавить новый вариант
    </Button>
  </Form.Item>
      </Form.Item>
    )}

  {editingProduct && (
  <Form.Item label="Варианты веса и цены">
    {grammList.map((g, idx) => (
      <Space key={idx} align="end" style={{ display: "flex", marginBottom: 8 }}>
        <InputNumber
          value={g.gramm}
          onChange={(val) => {
            const newList = [...grammList];
            newList[idx].gramm = val;
            setGrammList(newList);
          }}
          style={{ width: "120px" }}
          addonAfter="г"
          disabled={!!editingProduct.id && g._existing} // 🔹 блокируем вес для существующих
        />
        <InputNumber
          value={g.price}
          onChange={(val) => {
            const newList = [...grammList];
            newList[idx].price = val;
            setGrammList(newList);
          }}
          style={{ width: "150px" }}
          addonAfter="сум"
        />
        <InputNumber
          value={g.oldPrice}
          onChange={(val) => {
            const newList = [...grammList];
            newList[idx].oldPrice = val;
            setGrammList(newList);
          }}
          style={{ width: "150px" }}
          addonAfter="сум"
        />
        <Button danger onClick={() => setGrammList(grammList.filter((_, i) => i !== idx))}>
          Удалить
        </Button>
      </Space>
    ))}

 <Button
  type="primary"
  ghost
  onClick={() =>
    setGrammList([
      ...grammList,
      { gramm: "", price: "", oldPrice: "", _existing: false },
    ])
  }
  style={{
    display: "block",
    width: "30%",
height : "42px",
 borderRadius: "18px", 
    margin: "26px auto 0", // сверху отступ, автоцентрирование
  }}
>
  + Добавить новый вариант
</Button>
  </Form.Item>
)}


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


    {/* --- Модалка просмотра деталей --- */}
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
            <Descriptions.Item label="ID">{selectedProduct.id}</Descriptions.Item>
            <Descriptions.Item label="Название">{selectedProduct.name}</Descriptions.Item>
            <Descriptions.Item label="Категория">
              {categories.find((c) => c.id === selectedProduct.packageID)?.name || selectedProduct.packageID}
            </Descriptions.Item>
            <Descriptions.Item label="Вес">{selectedProduct.gramm}г</Descriptions.Item>
            <Descriptions.Item label="Цена">
              <Space direction="vertical" size={0}>
                <span style={{ fontWeight: "bold" }}>{selectedProduct.price} сум</span>
                {selectedProduct.oldPrice && selectedProduct.oldPrice > 0 && (
                  <span style={{ textDecoration: "line-through", color: "#999" }}>
                    {selectedProduct.oldPrice} сум
                  </span>
                )}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Статус">
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
              {Array.from({ length: 5 }).map((_, i) => {
                const img = selectedProduct.design?.[`imageURL${i + 1}`];
                return (
                  img && (
                    <Col span={8} key={i}>
                      <Card
                        hoverable
                        bodyStyle={{ padding: 8 }}
                        cover={
                          <Image
                            src={img}
                            alt={`Фото ${i + 1}`}
                            style={{ height: 120, objectFit: "cover" }}
                            preview={{ mask: <EyeOutlined /> }}
                          />
                        }
                      >
                        <div style={{ textAlign: "center", fontSize: 12, color: "#666" }}>
                          Фото {i + 1}
                        </div>
                      </Card>
                    </Col>
                  )
                );
              })}
            </Row>
            {!Array.from({ length: 5 }).some((_, i) => selectedProduct.design?.[`imageURL${i + 1}`]) && (
              <div style={{ textAlign: "center", color: "#999", padding: 20 }}>Нет фотографий</div>
            )}
          </div>
        </div>
      )}
    </Modal>
  </div>
);

};

export default ProductsPage;