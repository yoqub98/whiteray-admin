// src/ViewProductModal.js
import React from "react";
import { Modal, Image, Tag } from "antd";

const ViewProductModal = ({ visible, onClose, product, categories }) => {
  if (!product) return null;

  const images = [];
  for (let i = 1; i <= 10; i++) {
    if (product[`imageURL${i}`]) {
      images.push(product[`imageURL${i}`]);
    }
  }

  return (
    <Modal
      title="Просмотр продукта"
      open={visible}
      onCancel={onClose}
      footer={[
        <button key="close" onClick={onClose} className="ant-btn">
          Закрыть
        </button>,
      ]}
      width={800}
    >
      <div style={{ padding: "20px 0" }}>
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12, color: "#666" }}>Фотографии</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {images.map((url, index) => (
              <Image
                key={index}
                src={url}
                width={120}
                height={120}
                style={{ objectFit: "cover", borderRadius: 8 }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>ID</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{product.id}</div>
          </div>
          <div>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Название</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{product.name}</div>
          </div>
          <div>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Категория</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              {categories.find((c) => c.id === product.packageID)?.name || product.packageID}
            </div>
          </div>
          <div>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Вес</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{product.gramm}г</div>
          </div>
          <div>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Цена</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              {product.price} ₽
              {product.oldPrice && (
                <span
                  style={{
                    marginLeft: 8,
                    textDecoration: "line-through",
                    color: "#999",
                    fontSize: 14,
                  }}
                >
                  {product.oldPrice} ₽
                </span>
              )}
            </div>
          </div>
          <div>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Статус</div>
            <Tag color={product.status === "active" ? "green" : "orange"}>
              {product.status === "active" ? "Активен" : "Приостановлен"}
            </Tag>
          </div>
          {product.description && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Описание</div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>{product.description}</div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ViewProductModal;
