import React, { useState, useEffect } from "react";
import { Table, Button, Space, Tag, Tooltip, message, Image } from "antd";
import { PlusOutlined, EyeOutlined, DeleteOutlined } from "@ant-design/icons";
import { supabase } from "./supabaseClient";
import AddProductModal from "./AddProductModal";
import ViewProductModal from "./ViewProductModal";

const App = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

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
      designs.forEach((d) => {
        designMap[d.id] = d;
      });

      const merged = products.map((p) => ({
        ...p,
        ...designMap[p.designID],
      }));

      setProducts(merged);
    } catch (err) {
      console.error(err);
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
      message.error("Ошибка загрузки категорий: " + err.message);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

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
        <Tag color={status === "active" ? "green" : "orange"}>
          {status === "active" ? "Активен" : "Приостановлен"}
        </Tag>
      ),
    },
    {
      title: "Действия",
      key: "actions",
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Просмотр">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedProduct(record);
                setViewModalVisible(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Удалить">
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Управление продуктами</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalVisible(true)} size="large">
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

      <AddProductModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onSuccess={fetchProducts}
        categories={categories}
      />

      <ViewProductModal
        visible={viewModalVisible}
        onClose={() => setViewModalVisible(false)}
        product={selectedProduct}
        categories={categories}
      />
    </div>
  );
};

export default App;
