import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Space,
  Tag,
  Input,
  Badge,
  Tooltip,
  message,
  Modal,
  Descriptions,
  Card,
  Row,
  Col,
  Select,
  DatePicker,
  Dropdown,
  Menu,
  Typography,
  Statistic,
  Divider,
} from "antd";
import {
  EyeOutlined,
  SearchOutlined,
  FilterOutlined,
  ReloadOutlined,
  PhoneOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  MoreOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import { supabase } from "../supabaseClient";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import OrderDetailsModal from "./OrderDetailsModal";

dayjs.locale("ru");

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateRange, setDateRange] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    processing: 0,
    completed: 0,
    totalRevenue: 0,
  });

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setOrders(data || []);
      calculateStats(data || []);
    } catch (err) {
      console.error("❌ fetchOrders error:", err);
      message.error("Ошибка загрузки заказов: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    filterOrders();
  }, [orders, searchText, statusFilter, paymentFilter, dateRange]);

  const calculateStats = (data) => {
    const newOrders = data.filter((o) => o.delivery_status === "new").length;
    const processing = data.filter((o) => o.delivery_status === "processing").length;
    const completed = data.filter((o) => o.delivery_status === "completed").length;
    const totalRevenue = data.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);

    setStats({
      total: data.length,
      new: newOrders,
      processing,
      completed,
      totalRevenue,
    });
  };

  const filterOrders = () => {
    let filtered = [...orders];

    // Search filter
    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.order_number?.toLowerCase().includes(search) ||
          order.client_name?.toLowerCase().includes(search) ||
          order.phone?.includes(search) ||
          order.tg_username?.toLowerCase().includes(search)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => order.delivery_status === statusFilter);
    }

    // Payment filter
    if (paymentFilter !== "all") {
      filtered = filtered.filter((order) => order.payment_status === paymentFilter);
    }

    // Date range filter
    if (dateRange && dateRange[0] && dateRange[1]) {
      filtered = filtered.filter((order) => {
        const orderDate = dayjs(order.created_at);
        return orderDate.isAfter(dateRange[0]) && orderDate.isBefore(dateRange[1]);
      });
    }

    setFilteredOrders(filtered);
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

  // Function to parse order items and get product summary
  const parseOrderItems = (itemsJson) => {
    try {
      if (typeof itemsJson === 'string') {
        return JSON.parse(itemsJson);
      } else if (Array.isArray(itemsJson)) {
        return itemsJson;
      }
      return [];
    } catch {
      return [];
    }
  };

  // Function to get product summary for the table column
  const getProductSummary = (order) => {
    const items = parseOrderItems(order.items);
    
    if (items.length === 0) {
      return "—";
    }

    // Show first 2-3 products with quantities
    const displayItems = items.slice(0, 3);
    const remainingCount = items.length - displayItems.length;

    return (
      <Space direction="vertical" size={2} style={{ width: "100%" }}>
        {displayItems.map((item, index) => (
          <div key={index} style={{ lineHeight: "1.2" }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {item.quantity}x
            </Text>{" "}
            <Text style={{ fontSize: 12 }}>{item.name}</Text>
          </div>
        ))}
        {remainingCount > 0 && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            +{remainingCount} ещё...
          </Text>
        )}
      </Space>
    );
  };

  // Function to get total quantity of items in order
  const getTotalQuantity = (order) => {
    const items = parseOrderItems(order.items);
    return items.reduce((total, item) => total + (item.quantity || 0), 0);
  };

  const updateOrderStatus = async (orderId, field, value) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (error) throw error;

      message.success("Статус обновлен");
      fetchOrders();
    } catch (err) {
      console.error("❌ updateOrderStatus error:", err);
      message.error("Ошибка обновления статуса: " + err.message);
    }
  };

  const viewOrderDetails = (order) => {
    setSelectedOrder(order);
    setViewModalVisible(true);
  };

  const getActionMenu = (order) => (
    <Menu
      items={[
        {
          key: "view",
          label: "Просмотреть детали",
          icon: <EyeOutlined />,
          onClick: () => viewOrderDetails(order),
        },
        {
          type: "divider",
        },
        {
          key: "status",
          label: "Изменить статус доставки",
          icon: <SyncOutlined />,
          children: [
            {
              key: "new",
              label: "Новый",
              onClick: () => updateOrderStatus(order.id, "delivery_status", "new"),
            },
            {
              key: "processing",
              label: "В обработке",
              onClick: () => updateOrderStatus(order.id, "delivery_status", "processing"),
            },
            {
              key: "delivering",
              label: "Доставляется",
              onClick: () => updateOrderStatus(order.id, "delivery_status", "delivering"),
            },
            {
              key: "completed",
              label: "Завершен",
              onClick: () => updateOrderStatus(order.id, "delivery_status", "completed"),
            },
            {
              key: "cancelled",
              label: "Отменен",
              onClick: () => updateOrderStatus(order.id, "delivery_status", "cancelled"),
            },
          ],
        },
        {
          key: "payment",
          label: "Изменить статус оплаты",
          icon: <DollarOutlined />,
          children: [
            {
              key: "pending",
              label: "Ожидает оплаты",
              onClick: () => updateOrderStatus(order.id, "payment_status", "pending"),
            },
            {
              key: "paid",
              label: "Оплачен",
              onClick: () => updateOrderStatus(order.id, "payment_status", "paid"),
            },
            {
              key: "failed",
              label: "Ошибка оплаты",
              onClick: () => updateOrderStatus(order.id, "payment_status", "failed"),
            },
          ],
        },
      ]}
    />
  );

  const columns = [
    {
      title: "№",
      key: "index",
      width: 60,
      fixed: "left",
      render: (_, __, index) => index + 1,
    },
    {
      title: "Номер заказа",
      dataIndex: "order_number",
      key: "order_number",
      width: 160,
      fixed: "left",
      sorter: (a, b) => a.order_number.localeCompare(b.order_number),
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: "Товары",
      key: "products",
      width: 200,
      render: (_, record) => (
        <Tooltip 
          title={
            <div>
              {parseOrderItems(record.items).map((item, index) => (
                <div key={index}>
                  {item.quantity}x {item.name}
                </div>
              ))}
            </div>
          }
        >
          <Space direction="vertical" size={0} style={{ width: "100%" }}>
            {getProductSummary(record)}
            <Text type="secondary" style={{ fontSize: 11 }}>
              Всего: {getTotalQuantity(record)} шт.
            </Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: "Клиент",
      dataIndex: "client_name",
      key: "client_name",
      width: 150,
      sorter: (a, b) => (a.client_name || "").localeCompare(b.client_name || ""),
      render: (name, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>
            <UserOutlined /> {name || "—"}
          </Text>
          {record.tg_username && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              @{record.tg_username}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "Телефон",
      dataIndex: "phone",
      key: "phone",
      width: 160,
      render: (phone) =>
        phone ? (
          <Text copyable>
            <PhoneOutlined /> {phone}
          </Text>
        ) : (
          "—"
        ),
    },
    {
      title: "Статус доставки",
      dataIndex: "delivery_status",
      key: "delivery_status",
      width: 150,
      filters: [
        { text: "Новый", value: "new" },
        { text: "В обработке", value: "processing" },
        { text: "Доставляется", value: "delivering" },
        { text: "Завершен", value: "completed" },
        { text: "Отменен", value: "cancelled" },
      ],
      onFilter: (value, record) => record.delivery_status === value,
      render: (status) => {
        const config = getDeliveryStatusConfig(status);
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.text}
          </Tag>
        );
      },
    },
    {
      title: "Статус оплаты",
      dataIndex: "payment_status",
      key: "payment_status",
      width: 150,
      filters: [
        { text: "Ожидает оплаты", value: "pending" },
        { text: "Оплачен", value: "paid" },
        { text: "Ошибка оплаты", value: "failed" },
      ],
      onFilter: (value, record) => record.payment_status === value,
      render: (status) => {
        const config = getPaymentStatusConfig(status);
        return <Badge status={config.color} text={config.text} />;
      },
    },
    {
      title: "Способ оплаты",
      dataIndex: "payment_method",
      key: "payment_method",
      width: 120,
      render: (method) => getPaymentMethodText(method),
    },
    {
      title: "Сумма",
      dataIndex: "total_price",
      key: "total_price",
      width: 120,
      sorter: (a, b) => parseFloat(a.total_price) - parseFloat(b.total_price),
      render: (price) => (
        <Text strong style={{ color: "#52c41a" }}>
          {parseFloat(price).toLocaleString("ru-RU")} сум
        </Text>
      ),
    },
    {
      title: "Дата создания",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      defaultSortOrder: "descend",
      render: (date) => (
        <Tooltip title={dayjs(date).format("DD MMMM YYYY, HH:mm:ss")}>
          <Space direction="vertical" size={0}>
            <Text>{dayjs(date).format("DD.MM.YYYY")}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {dayjs(date).format("HH:mm")}
            </Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: "Действия",
      key: "actions",
      width: 100,
      fixed: "right",
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Просмотреть детали">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => viewOrderDetails(record)}
            />
          </Tooltip>
          <Dropdown overlay={getActionMenu(record)} trigger={["click"]}>
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered style={{ borderColor: "#cacacaff", borderRadius: "10pt", borderWidth: "1.2px"}}>
            <Statistic
              title="Всего заказов"
              value={stats.total}
              valueStyle={{ color: "#061d32ff", fontWeight: "600" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ borderColor: "#cacacaff", borderRadius: "10pt", borderWidth: "1.2px"}}>
            <Statistic
              title="Новые"
              value={stats.new}
              prefix={<ShoppingCartOutlined  style={ {color: "#006aceff",}}/>}
              valueStyle={{ color: "#212121ff", fontWeight: "600" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ borderColor: "#cacacaff", borderRadius: "10pt", borderWidth: "1.2px"}}>
            <Statistic
              title="В процессе"
              value={stats.processing}
              prefix={<ClockCircleOutlined style={{color: "#faa331ff"}}  />}
              valueStyle={{ color: "#333333ff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ borderColor: "#cacacaff", borderRadius: "10pt", borderWidth: "1.2px"}}>
            <Statistic
              title="Общая выручка"
              value={stats.totalRevenue}
              suffix="сум"
              prefix={<DollarOutlined style={{ color: "#52c41a" }} />}
              valueStyle={{ color: "#262626", fontWeight : "700"}}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <Input
              placeholder="Поиск по номеру, имени, телефону..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              size="large"
            />
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <Select
              placeholder="Статус доставки"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: "100%" }}
              size="large"
              options={[
                { label: "Все статусы", value: "all" },
                { label: "Новый", value: "new" },
                { label: "В обработке", value: "processing" },
                { label: "Доставляется", value: "delivering" },
                { label: "Завершен", value: "completed" },
                { label: "Отменен", value: "cancelled" },
              ]}
            />
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <Select
              placeholder="Статус оплаты"
              value={paymentFilter}
              onChange={setPaymentFilter}
              style={{ width: "100%" }}
              size="large"
              options={[
                { label: "Все оплаты", value: "all" },
                { label: "Ожидает оплаты", value: "pending" },
                { label: "Оплачен", value: "paid" },
                { label: "Ошибка оплаты", value: "failed" },
              ]}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <RangePicker
              style={{ width: "100%" }}
              value={dateRange}
              onChange={setDateRange}
              format="DD.MM.YYYY"
              placeholder={["Дата от", "Дата до"]}
              size="large"
            />
          </Col>
          <Col xs={24} sm={12} lg={2}>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchOrders}
              loading={loading}
              size="large"
              style={{ width: "100%" }}
            />
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Table
        columns={columns}
        dataSource={filteredOrders}
        rowKey={(record) => record.id}
        loading={loading}
        scroll={{ x: 1700 }} // Increased scroll width to accommodate new column
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `Всего: ${total} заказов`,
          pageSizeOptions: ["10", "20", "50", "100"],
        }}
        bordered
      />

      {/* View Details Modal */}
      <OrderDetailsModal
        visible={viewModalVisible}
        order={selectedOrder}
        onClose={() => setViewModalVisible(false)}
        onStatusUpdate={fetchOrders}
      />
    </div>
  );
};

export default OrdersPage;