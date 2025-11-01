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
  const [parsedOrder, setParsedOrder] = useState(null);

  useEffect(() => {
    if (visible && order) {
      // Parse order data if needed
      const parsed = parseOrderData(order);
      setParsedOrder(parsed);
      
      fetchProductDetails(parsed);
      fetchPaymentScreenshot();
      // Check if bot is configured
      setBotConfigured(telegramBotService.isConfigured());
    }
  }, [visible, order]);

  const parseOrderData = (orderData) => {
    const parsed = { ...orderData };

    // Parse address_location if it's a string
    if (typeof parsed.address_location === "string") {
      try {
        parsed.address_location = JSON.parse(parsed.address_location);
      } catch (e) {
        console.warn("Failed to parse address_location:", e);
        parsed.address_location = null;
      }
    }

    // Parse items if it's a string
    if (typeof parsed.items === "string") {
      try {
        parsed.items = JSON.parse(parsed.items);
      } catch (e) {
        console.warn("Failed to parse items:", e);
        parsed.items = [];
      }
    }

    return parsed;
  };

  const fetchProductDetails = async (orderData = parsedOrder) => {
    if (!orderData) return;

    setLoading(true);
    try {
      // Get items array
      const items = Array.isArray(orderData.items) ? orderData.items : [];

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
    const currentOrder = parsedOrder || order;
    if (!currentOrder) return;

    // Check if bot is configured
    if (!telegramBotService.isConfigured()) {
      message.error("❌ Telegram bot не настроен. Проверьте токен бота.");
      return;
    }

    // Check if chat_id is available (check for both null/undefined and ensure it's a valid number)
    const chatId = currentOrder.chat_id;
    if (!chatId || (typeof chatId === 'number' && isNaN(chatId))) {
      message.error("❌ Chat ID не найден для этого заказа");
      return;
    }

    setSendingPaymentRequest(true);
    try {
      await telegramBotService.sendPaymentRequest(currentOrder);
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

  const currentOrder = parsedOrder || order;

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
    currentOrder.address_location &&
    typeof currentOrder.address_location === "object" &&
    currentOrder.address_location.lat &&
    currentOrder.address_location.lon &&
    !isNaN(currentOrder.address_location.lat) &&
    !isNaN(currentOrder.address_location.lon);

  const hasAddressText = currentOrder.address_text && currentOrder.address_text.trim() !== "";

  const mapUrl = hasValidLocation
    ? `https://yandex.ru/maps/?ll=${currentOrder.address_location.lon},${currentOrder.address_location.lat}&z=16&pt=${currentOrder.address_location.lon},${currentOrder.address_location.lat},pm2rdm&l=map`
    : null;

  const coordinatesText = hasValidLocation
    ? `${currentOrder.address_location.lat}, ${currentOrder.address_location.lon}`
    : "";

  // Check if button should be disabled
  const chatId = currentOrder.chat_id;
  const isButtonDisabled = !chatId || !botConfigured || (typeof chatId === 'number' && isNaN(chatId));

  return (
    <Modal
      title={
        <Space style={{ paddingBottom: 8 }}>
          <EyeOutlined style={{ fontSize: 20 }} />
          <span style={{ fontSize: 20, fontWeight: 700 }}>
            Детали заказа #{currentOrder.order_number}
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
          disabled={isButtonDisabled}
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
      {!currentOrder.chat_id && (
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
                <UserOutlined /> {currentOrder.client_name || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Телефон">
                <PhoneOutlined /> {currentOrder.phone || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Telegram">
                @{currentOrder.tg_username || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Chat ID">{currentOrder.chat_id || "—"}</Descriptions.Item>
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
              <Descriptions.Item label="Номер заказа">{currentOrder.order_number}</Descriptions.Item>
              <Descriptions.Item label="Статус доставки">
                {(() => {
                  const config = getDeliveryStatusConfig(currentOrder.delivery_status);
                  return (
                    <Tag color={config.color} icon={config.icon}>
                      {config.text}
                    </Tag>
                  );
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="Статус оплаты">
                {(() => {
                  const config = getPaymentStatusConfig(currentOrder.payment_status);
                  return <Badge status={config.color} text={config.text} />;
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="Способ оплаты">
                {getPaymentMethodText(currentOrder.payment_method)}
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
              <EnvironmentOutlined /> {currentOrder.address_text}
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
              {parseFloat(currentOrder.total_price || 0).toLocaleString("ru-RU")} сум
            </Title>
          </Space>
        </div>
      </Card>

      {currentOrder.notes && (
        <Card title="Примечания" style={{ marginBottom: 16 }}>
          <Text>{currentOrder.notes}</Text>
        </Card>
      )}

      <Card title="Временные метки">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Создан">
            {dayjs(currentOrder.created_at).format("DD.MM.YYYY HH:mm:ss")}
          </Descriptions.Item>
          <Descriptions.Item label="Обновлен">
            {dayjs(currentOrder.updated_at).format("DD.MM.YYYY HH:mm:ss")}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </Modal>
  );
};

export default OrderDetailsModal;