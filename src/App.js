import React, { useState, useEffect } from "react";
import { Layout, Menu, Button, message, Modal, Space, Typography, Tag, Switch } from "antd";
import { ShoppingOutlined, FileTextOutlined, ApiOutlined, CheckCircleOutlined, CloseCircleOutlined, PlayCircleOutlined, PauseCircleOutlined } from "@ant-design/icons";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import ProductsPage from "./pages/ProductsPage";
import OrdersPage from "./pages/OrdersPage";

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const AppContent = () => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [webhookModalVisible, setWebhookModalVisible] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState(null);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [webhookPaused, setWebhookPaused] = useState(false);

  useEffect(() => {
    checkWebhookStatus();
    checkPauseStatus();
  }, []);

  const checkWebhookStatus = async () => {
    try {
      const response = await fetch('/api/set-webhook');
      const result = await response.json();
      
      if (result.ok && result.result) {
        setWebhookInfo(result.result);
      }
    } catch (error) {
      console.error('Error checking webhook:', error);
    }
  };

  const checkPauseStatus = async () => {
    try {
      const response = await fetch('/api/telegram-webhook?check_pause=true');
      const result = await response.json();
      if (result.paused !== undefined) {
        setWebhookPaused(result.paused);
      }
    } catch (error) {
      console.error('Error checking pause status:', error);
    }
  };

  const setupWebhook = async () => {
    setSettingWebhook(true);
    try {
      const domain = window.location.origin;
      const webhookUrl = `${domain}/api/telegram-webhook`;

      console.log('🔧 Setting up webhook:', webhookUrl);

      const response = await fetch('/api/set-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ webhookUrl }),
      });

      const result = await response.json();

      if (result.ok) {
        message.success('✅ Webhook настроен успешно!');
        await checkWebhookStatus();
      } else {
        message.error('❌ Ошибка настройки webhook: ' + (result.description || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error setting webhook:', error);
      message.error('❌ Ошибка: ' + error.message);
    } finally {
      setSettingWebhook(false);
    }
  };

  const toggleWebhookPause = async (checked) => {
    const newPausedState = !checked;
    setWebhookPaused(newPausedState);
    
    try {
      const response = await fetch('/api/telegram-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ set_pause: true, paused: newPausedState }),
      });
      
      const result = await response.json();
      
      if (result.ok) {
        message.success(checked ? '▶️ Webhook активирован' : '⏸️ Webhook приостановлен');
      } else {
        throw new Error('Failed to update pause state');
      }
    } catch (error) {
      console.error('Error toggling webhook:', error);
      message.error('❌ Ошибка изменения статуса webhook');
      setWebhookPaused(!newPausedState); // Revert on error
    }
  };

  const menuItems = [
    {
      key: "/",
      icon: <ShoppingOutlined />,
      label: <Link to="/">Продукты</Link>,
    },
    {
      key: "/orders",
      icon: <FileTextOutlined />,
      label: <Link to="/orders">Заказы</Link>,
    },
  ];

  const isWebhookConfigured = webhookInfo && webhookInfo.url && webhookInfo.url.includes('/api/telegram-webhook');

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <div style={{ color: "white", fontSize: "20px", fontWeight: "bold" }}>
          Admin Panel
        </div>
        <Space>
          {isWebhookConfigured ? (
            webhookPaused ? (
              <Tag icon={<PauseCircleOutlined />} color="warning">
                Webhook приостановлен
              </Tag>
            ) : (
              <Tag icon={<CheckCircleOutlined />} color="success">
                Webhook активен
              </Tag>
            )
          ) : (
            <Tag icon={<CloseCircleOutlined />} color="error">
              Webhook не настроен
            </Tag>
          )}
          <Button 
            type="primary" 
            icon={<ApiOutlined />}
            onClick={() => setWebhookModalVisible(true)}
          >
            Настройки Webhook
          </Button>
        </Space>
      </Header>
      <Layout>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          style={{ background: "#fff" }}
          width={200}
        >
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            style={{ height: "100%", borderRight: 0 }}
            items={menuItems}
          />
        </Sider>
        <Layout style={{ padding: "0 24px 24px" }}>
          <Content
            style={{
              padding: 24,
              margin: 0,
              minHeight: 280,
              background: "#fff",
              borderRadius: 8,
            }}
          >
            <Routes>
              <Route path="/" element={<ProductsPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="*" element={<ProductsPage />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>

      {/* Webhook Setup Modal */}
      <Modal
        title={
          <Space>
            <ApiOutlined />
            <span>Настройка Telegram Webhook</span>
          </Space>
        }
        open={webhookModalVisible}
        onCancel={() => setWebhookModalVisible(false)}
        footer={[
          <Button key="refresh" onClick={() => { checkWebhookStatus(); checkPauseStatus(); }}>
            Обновить статус
          </Button>,
          <Button 
            key="setup" 
            type="primary" 
            loading={settingWebhook}
            onClick={setupWebhook}
          >
            Настроить Webhook
          </Button>,
          <Button key="close" onClick={() => setWebhookModalVisible(false)}>
            Закрыть
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {isWebhookConfigured && (
            <div style={{ 
              padding: 12, 
              background: '#f0f5ff', 
              border: '1px solid #adc6ff',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <Space>
                {webhookPaused ? <PauseCircleOutlined style={{ fontSize: 18 }} /> : <PlayCircleOutlined style={{ fontSize: 18 }} />}
                <Text strong>
                  {webhookPaused ? 'Webhook приостановлен' : 'Webhook работает'}
                </Text>
              </Space>
              <Switch 
                checked={!webhookPaused}
                onChange={toggleWebhookPause}
                checkedChildren="Вкл"
                unCheckedChildren="Выкл"
              />
            </div>
          )}

          <div>
            <Text strong>Статус webhook:</Text>
            <br />
            {webhookInfo ? (
              <>
                <Text>URL: {webhookInfo.url || 'Не настроен'}</Text>
                <br />
                <Text type="secondary">
                  Ожидающих обновлений: {webhookInfo.pending_update_count || 0}
                </Text>
                <br />
                {webhookInfo.last_error_date && (
                  <>
                    <Text type="danger">
                      Последняя ошибка: {webhookInfo.last_error_message}
                    </Text>
                    <br />
                  </>
                )}
              </>
            ) : (
              <Text type="secondary">Загрузка...</Text>
            )}
          </div>

          <div>
            <Text strong>Что делает webhook?</Text>
            <br />
            <Text type="secondary">
              Webhook позволяет вашему боту получать сообщения от пользователей в реальном времени.
              Когда клиент отправляет скриншот оплаты боту, webhook автоматически обновит статус заказа.
            </Text>
          </div>

          <div>
            <Text strong>Play/Pause функция:</Text>
            <br />
            <Text type="secondary">
              Когда webhook приостановлен, бот перестает обрабатывать скриншоты оплаты от клиентов.
              Используйте эту функцию для временной остановки приема платежей.
            </Text>
          </div>

          <div>
            <Text strong>Текущий URL webhook:</Text>
            <br />
            <Text code>{window.location.origin}/api/telegram-webhook</Text>
          </div>

          {!isWebhookConfigured && (
            <div style={{ 
              padding: 12, 
              background: '#fff7e6', 
              border: '1px solid #ffd591',
              borderRadius: 4 
            }}>
              <Text type="warning">
                ⚠️ Webhook не настроен. Нажмите "Настроить Webhook" для активации приема скриншотов оплаты от клиентов.
              </Text>
            </div>
          )}

          {isWebhookConfigured && !webhookPaused && (
            <div style={{ 
              padding: 12, 
              background: '#f6ffed', 
              border: '1px solid #b7eb8f',
              borderRadius: 4 
            }}>
              <Text type="success">
                ✅ Webhook активен! Бот готов принимать скриншоты оплаты от клиентов.
              </Text>
            </div>
          )}

          {isWebhookConfigured && webhookPaused && (
            <div style={{ 
              padding: 12, 
              background: '#fff7e6', 
              border: '1px solid #ffd591',
              borderRadius: 4 
            }}>
              <Text type="warning">
                ⏸️ Webhook приостановлен. Скриншоты оплаты не обрабатываются.
              </Text>
            </div>
          )}
        </Space>
      </Modal>
    </Layout>
  );
};

const App = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;