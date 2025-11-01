import React, { useState } from "react";
import { Layout, Menu } from "antd";
import { ShoppingOutlined, FileTextOutlined } from "@ant-design/icons";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import ProductsPage from "./pages/ProductsPage";
import OrdersPage from "./pages/OrdersPage";

const { Header, Content, Sider } = Layout;

const AppContent = () => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

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

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", padding: "0 24px" }}>
        <div style={{ color: "white", fontSize: "20px", fontWeight: "bold" }}>
          Admin Panel
        </div>
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
            </Routes>
          </Content>
        </Layout>
      </Layout>
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