// src/AddProductModal.js
import React, { useState } from "react";
import { Modal, Form, Input, InputNumber, Select, Upload, Button, Space, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import ImgCrop from "antd-img-crop";
import { supabase } from "./supabaseClient";

const AddProductModal = ({ visible, onClose, onSuccess, categories }) => {
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [grammList, setGrammList] = useState([{ value: "" }]);
  const [loading, setLoading] = useState(false);

  const uploadImageToSupabase = async (file, productName, index) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${productName.replace(/\s+/g, "_")}_${Date.now()}_${index}.${fileExt}`;

    const { error } = await supabase.storage
      .from("productPhotos")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });

    if (error) throw error;

    const { data } = supabase.storage.from("productPhotos").getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      if (fileList.length === 0) {
        message.error("Загрузите хотя бы одно фото");
        setLoading(false);
        return;
      }

      const productName = values.name;

      // загружаем фото
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

      const gramms = grammList
        .map((g) => parseInt(g.value))
        .filter((g) => !isNaN(g));

      if (gramms.length === 0) {
        message.error("Добавьте хотя бы один вес");
        setLoading(false);
        return;
      }

      // создаём запись в designs
      const { data: designData, error: designError } = await supabase
        .from("designs")
        .insert({ name: productName, ...imageUrls })
        .select()
        .single();

      if (designError) throw designError;

      // создаём продукты
      for (let i = 0; i < gramms.length; i++) {
        await supabase.from("product").insert({
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
      }

      message.success(`Создано продуктов: ${gramms.length}`);
      onSuccess();
      onClose();
      form.resetFields();
      setFileList([]);
      setGrammList([{ value: "" }]);
    } catch (err) {
      console.error(err);
      message.error("Ошибка: " + err.message);
    } finally {
      setLoading(false);
    }
  };

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
    <Modal
      title="Создать продукт"
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Отмена
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={() => form.submit()}>
          Создать
        </Button>,
      ]}
      width={800}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
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
  );
};

export default AddProductModal;
