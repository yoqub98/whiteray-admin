import React, { useState, useEffect } from "react";
import {
  Modal,
  Descriptions,
  Card,
  Row,
  Col,
  Space,
  Tag,
  Badge,
  Button,
  Typography,
  Divider,
  Table,
  Image,
  message,
  Spin,
  Alert,
} from "antd";
import {
  EyeOutlined,
  UserOutlined,
  PhoneOutlined,
  EnvironmentOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  SendOutlined,
  PictureOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { supabase } from "../supabaseClient";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import telegramBotService from "../services/telegramBot";

dayjs.locale("ru");

const { Text, Title } = Typography;

const OrderDetailsModal = ({ visible, order, onClose, onStatusUpdate }) => {
  const [products, setProducts] = useState({});
  const [loading, setLoading] = useState(false);
  const [tableData, setTableData] = useState([]);
  const [sendingPaymentRequest, setSendingPaymentRequest] = useState(false);
  const [paymentScreenshot, setPaymentScreenshot] = useState(null);
  const [botConfigured, setBotConfigured] = useState(true);

  useEffect(() => {
    if (visible && order) {
      fetchProductDetails();
      fetchPaymentScreenshot();
      // Check if bot is configured
      setBotConfigured(telegramBotService.isConfigured());
    }
  }, [visible, order]);

  const fetchProductDetails = async () => {
    if (!order) return;

    setLoading(true);
    try {
      // Parse items - handle both string and array
      let items = [];
      if (typeof order.items === "string") {
        try {
          items = JSON.parse(order.items);
        } catch (e) {
          console.error("Failed to parse items:", e);
          setLoading(false);
          return;
        }
      } else if (Array.isArray(order.items)) {
        items = order.items;
      }

      console.log("📦 Parsed items:", items);

      // Set table data first so we can show the items immediately
      setTableData(items.map((item, index) => ({
        ...item,
        key: item.product_id || `item-${index}`, // Add unique key for each row
      })));

      // ✅ Extract product IDs
      const productIds = [...new Set(items.map((i) => i.product_id))].filter(Boolean);

      if (productIds.length === 0) {
        console.warn("No product IDs found in order items.");
        setProducts({});
        setLoading(false);
        return;
      }

      // Fetch product data
      const { data: productsData, error: productsError } = await supabase
        .from("product")
        .select("*")
        .in("id", productIds);

      if (productsError) throw productsError;

      // Get related design IDs
      const designIDs = [...new Set(productsData.map((p) => p.designID).filter(Boolean))];

      // Fetch designs
      let designs = [];
      if (designIDs.length > 0) {
        const { data: designsData, error: designError } = await supabase
          .from("designs")
          .select("*")
          .in("id", designIDs);

        if (designError) throw designError;
        designs = designsData || [];
      }

      // Map designs by ID
      const designMap = {};
      designs.forEach((d) => {
        designMap[d.id] = d;
      });

      // Merge product data with design info
      const productMap = {};
      productsData.forEach((p) => {
        productMap[p.id] = {
          ...p,
          design: designMap[p.designID] || {},
        };
      });

      setProducts(productMap);
      console.log("✅ Products loaded:", productMap);
    } catch (err) {
      console.error("❌ fetchProductDetails error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentScreenshot = async () => {
    if (!order?.id) return;

    try {
      const { data, error } = await supabase
        .from("orders")
        .select("payment_screenshot")
        .eq("id", order.id)
        .single();

      if (error) throw error;
      setPaymentScreenshot(data?.payment_screenshot);
    } catch (error) {
      console.error("❌ Error fetching payment screenshot:", error);
    }
  };

  const handleSendPaymentRequest = async () => {
    if (!order) return;

    // Check if bot is configured
    if (!telegramBotService.isConfigured()) {
      message.error("❌ Telegram bot не настроен. Проверьте токен бота.");
      return;
    }

    // Check if chat_id is available
    if (!order.chat_id) {
      message.error("❌ Chat ID не найден для этого заказа");
      return;
    }

    setSendingPaymentRequest(true);
    try {
      await telegramBotService.sendPaymentRequest(order);
      message.success("✅ Запрос на оплату отправлен клиенту");
    } catch (error) {
      console.error("❌ Error sending payment request:", error);
      message.error("❌ Ошибка отправки запроса на оплату: " + error.message);
    } finally {
      setSendingPaymentRequest(false);
    }
  };

  const getDeliveryStatusConfig = (status) => {
    const configs = {
      new: { color: "blue", text: "Новый", icon: <ClockCircleOutlined /> },
      processing: { color: "orange", text: "В обработке", icon: <SyncOutlined spin /> },
      delivering: { color: "cyan", text: "Доставляется", icon: <SyncOutlined /> },
      completed: { color: "green", text: "Завершен", icon: <CheckCircleOutlined /> },
      cancelled: { color: "red", text: "Отменен", icon: <CloseCircleOutlined /> },
    };
    return configs[status] || configs.new;
  };

  const getPaymentStatusConfig = (status) => {
    const configs = {
      pending: { color: "warning", text: "Ожидает оплаты" },
      paid: { color: "success", text: "Оплачен" },
      failed: { color: "error", text: "Ошибка оплаты" },
    };
    return configs[status] || configs.pending;
  };

  const getPaymentMethodText = (method) => {
    const methods = {
      cash: "Наличные",
      card: "Карта",
      online: "Онлайн",
      click: "Click",
      payme: "Payme",
    };
    return methods[method] || method;
  };

  if (!order) return null;

  const productColumns = [
    {
      title: "Фото",
      key: "image",
      width: 80,
      render: (_, record) => {
        const product = products[record.product_id];
        const firstImg =
          product?.design?.imageURL1 ||
          product?.design?.imageURL2 ||
          product?.design?.imageURL3 ||
          null;
        return firstImg ? (
          <div style={{ width: 50, height: 50, overflow: "hidden", borderRadius: 4 }}>
            <Image
              src={firstImg}
              width={50}
              height={50}
              style={{ objectFit: "cover" }}
              preview={false}
              alt="Product"
            />
          </div>
        ) : (
          "—"
        );
      },
    },
    {
      title: "Название",
      dataIndex: "name",
      key: "name",
      render: (name, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            ID: {record.product_id}
          </Text>
        </Space>
      ),
    },
    {
      title: "Вес",
      dataIndex: "gramm",
      key: "gramm",
      width: 80,
      render: (gramm) => gramm ? `${gramm}г` : "—",
    },
    {
      title: "Количество",
      dataIndex: "quantity",
      key: "quantity",
      width: 120,
      render: (qty, record) => {
        if (!qty) return "—";
        return `${qty} ${
          qty === 1
            ? record.measure_unit_one || "шт"
            : qty < 5
            ? record.measure_unit_few || "шт"
            : record.measure_unit_many || "шт"
        }`;
      },
    },
    {
      title: "Цена за ед.",
      dataIndex: "price",
      key: "price",
      width: 120,
      render: (price) => price ? <Text>{price.toLocaleString("ru-RU")} сум</Text> : "—",
    },
    {
      title: "Сумма",
      key: "total",
      width: 120,
      render: (_, record) => {
        const total = record.price && record.quantity ? record.price * record.quantity : 0;
        return <Text strong>{total.toLocaleString("ru-RU")} сум</Text>;
      },
    },
  ];

  const hasValidLocation =
    order.address_location &&
    typeof order.address_location === "object" &&
    order.address_location.lat &&
    order.address_location.lon &&
    !isNaN(order.address_location.lat) &&
    !isNaN(order.address_location.lon);

  const hasAddressText = order.address_text && order.address_text.trim() !== "";

  const mapUrl = hasValidLocation
    ? `https://yandex.ru/maps/?ll=${order.address_location.lon},${order.address_location.lat}&z=16&pt=${order.address_location.lon},${order.address_location.lat},pm2rdm&l=map`
    : null;

  const coordinatesText = hasValidLocation
    ? `${order.address_location.lat}, ${order.address_location.lon}`
    : "";

  return (
    <Modal
      title={
        <Space style={{ paddingBottom: 8 }}>
          <EyeOutlined style={{ fontSize: 20 }} />
          <span style={{ fontSize: 20, fontWeight: 700 }}>
            Детали заказа #{order.order_number}
          </span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button 
          key="payment-request" 
          type="primary" 
          icon={<SendOutlined />}
          loading={sendingPaymentRequest}
          onClick={handleSendPaymentRequest}
          disabled={!order.chat_id || !botConfigured}
        >
          Отправить запрос на оплату
        </Button>,
        <Button key="close" onClick={onClose}>
          Закрыть
        </Button>,
      ]}
      width={1000}
    >
      {/* Bot Configuration Warning */}
      {!botConfigured && (
        <Alert
          message="Telegram Bot не настроен"
          description="Пожалуйста, проверьте настройки Telegram бота. Функция отправки запросов на оплату недоступна."
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Chat ID Warning */}
      {!order.chat_id && (
        <Alert
          message="Chat ID не найден"
          description="Не удалось отправить запрос на оплату: Chat ID клиента не указан в заказе."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={16}>
        <Col span={12}>
          <Card
            title="Информация о клиенте"
            style={{
              marginBottom: 16,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)",
            }}
          >
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Имя">
                <UserOutlined /> {order.client_name || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Телефон">
                <PhoneOutlined /> {order.phone || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Telegram">
                @{order.tg_username || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Chat ID">{order.chat_id || "—"}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col span={12}>
          <Card
            title="Информация о заказе"
            style={{
              marginBottom: 16,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)",
            }}
          >
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Номер заказа">{order.order_number}</Descriptions.Item>
              <Descriptions.Item label="Статус доставки">
                {(() => {
                  const config = getDeliveryStatusConfig(order.delivery_status);
                  return (
                    <Tag color={config.color} icon={config.icon}>
                      {config.text}
                    </Tag>
                  );
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="Статус оплаты">
                {(() => {
                  const config = getPaymentStatusConfig(order.payment_status);
                  return <Badge status={config.color} text={config.text} />;
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="Способ оплаты">
                {getPaymentMethodText(order.payment_method)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      {/* Payment Screenshot Section */}
      {paymentScreenshot && (
        <Card title="Скриншот оплаты" style={{ marginBottom: 16 }}>
          <Space direction="vertical">
            <Text>Клиент отправил скриншот подтверждения оплаты:</Text>
            <Image
              width={200}
              src={paymentScreenshot}
              alt="Payment Screenshot"
              placeholder={
                <div style={{ width: 200, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spin />
                </div>
              }
            />
          </Space>
        </Card>
      )}

      <Card title="Адрес доставки" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          {hasAddressText ? (
            <Text>
              <EnvironmentOutlined /> {order.address_text}
            </Text>
          ) : hasValidLocation ? (
            <Text copyable={{ text: coordinatesText }}>
              <EnvironmentOutlined /> Гео-координаты: {coordinatesText}
            </Text>
          ) : (
            <Text>
              <EnvironmentOutlined /> Адрес не указан
            </Text>
          )}
          <Button
            type="primary"
            icon={<EnvironmentOutlined />}
            disabled={!hasValidLocation}
            onClick={() => hasValidLocation && window.open(mapUrl, "_blank")}
          >
            Показать на карте
          </Button>
        </Space>
      </Card>

      <Card title="Товары в заказе" style={{ marginBottom: 16 }} loading={loading}>
        <Table
          dataSource={tableData}
          pagination={false}
          size="small"
          columns={productColumns}
          scroll={{ x: 800 }}
          locale={{ emptyText: "Нет данных о товарах" }}
        />
        <Divider />
        <div style={{ textAlign: "right" }}>
          <Space direction="vertical" align="end">
            <Text type="secondary">Количество позиций: {tableData.length}</Text>
            <Title level={4} style={{ margin: 0 }}>
              <DollarOutlined /> Итого:{" "}
              {parseFloat(order.total_price || 0).toLocaleString("ru-RU")} сум
            </Title>
          </Space>
        </div>
      </Card>

      {order.notes && (
        <Card title="Примечания" style={{ marginBottom: 16 }}>
          <Text>{order.notes}</Text>
        </Card>
      )}

      <Card title="Временные метки">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Создан">
            {dayjs(order.created_at).format("DD.MM.YYYY HH:mm:ss")}
          </Descriptions.Item>
          <Descriptions.Item label="Обновлен">
            {dayjs(order.updated_at).format("DD.MM.YYYY HH:mm:ss")}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </Modal>
  );
};

export default OrderDetailsModal;