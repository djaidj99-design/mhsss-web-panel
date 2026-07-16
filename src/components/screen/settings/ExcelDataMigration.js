"use client";

import React, { useState, useCallback } from "react";
import {
  Button, Select, Card, Table, Tag, Alert, Spin,
  Typography, Divider, Space, Statistic, Row, Col, Modal,
  Collapse, List, App,
} from "antd";
import {
  CloudUploadOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined,
  WarningOutlined, InfoCircleOutlined,
} from "@ant-design/icons";
import { useSelector } from "react-redux";
import { useAuth } from "@/lib/AuthProvider";

const { Title, Text } = Typography;

const downloadCSV = (rows, filename, columns) => {
  if (!rows?.length) return;
  const header = columns.map((c) => c.label).join(",");
  const csvRows = rows.map((r) => columns.map((c) => {
    let val = c.accessor(r);
    if (val == null) val = "";
    const str = String(val);
    return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
  }).join(","));
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + header + "\n" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;bom" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const FILE_OPTIONS = [
  { label: "Mayra Yojna (मायरा)", value: "mayra" },
  { label: "Vivah Yojna (विवाह)", value: "vivah" },
];

const FILE_LABELS = { mayra: "Mayra Yojna", vivah: "Vivah Yojna" };

const ExcelDataMigration = () => {
  const { user } = useAuth();
  const programList = useSelector((state) => state.data.programList || []);
  const { message } = App.useApp();

  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState(["mayra", "vivah"]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const handlePreview = useCallback(async () => {
    if (!selectedProgram) { message.warning("Select a program first"); return; }
    setLoading(true);
    setPreview(null);
    setResult(null);
    try {
      const res = await fetch(`/api/migrate-excel-data?userId=${user?.uid}&programId=${selectedProgram.id}`);
      const data = await res.json();
      if (data.success) setPreview(data.preview);
      else message.error(data.error || "Preview failed");
    } catch {
      message.error("Failed to connect");
    }
    setLoading(false);
  }, [selectedProgram, user, message]);

  const handleMigrate = useCallback(async () => {
    if (!selectedProgram || !user) return;
    setConfirmModal({
      title: "Confirm Migration",
      content: `Migrate ${selectedFiles.map((f) => FILE_LABELS[f]).join(", ")} → "${selectedProgram.name}". Records missing name/phone/joinDate/DOB will be skipped.`,
      onOk: async () => {
        setConfirmModal(null);
        setLoading(true);
        setResult(null);
        try {
          const res = await fetch("/api/migrate-excel-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.uid,
              programId: selectedProgram.id,
              files: selectedFiles,
            }),
          });
          const data = await res.json();
          if (data.success) { setResult(data); message.success(`${data.summary.totalMigrated} members added`); }
          else message.error(data.message || data.error || "Migration failed");
        } catch { message.error("Failed to connect"); }
        setLoading(false);
      },
    });
  }, [selectedProgram, user, selectedFiles, message]);

  const handleRevert = useCallback(async () => {
    if (!selectedProgram || !user) return;
    setConfirmModal({
      title: "Revert Migration",
      content: `DELETE all members migrated via this tool in "${selectedProgram.name}" + their login accounts. Cannot be undone!`,
      danger: true,
      onOk: async () => {
        setConfirmModal(null);
        setLoading(true);
        try {
          const res = await fetch("/api/migrate-excel-data", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.uid, programId: selectedProgram.id }),
          });
          const data = await res.json();
          if (data.success) { setResult(null); message.success(`Reverted: ${data.deletedCount} removed`); }
          else message.error(data.message || data.error || "Revert failed");
        } catch { message.error("Failed to connect"); }
        setLoading(false);
      },
    });
  }, [selectedProgram, user, message]);

  const renderPreview = () => {
    if (!preview) return null;
    const allValid = Object.values(preview).reduce((s, f) => s + f.validCount, 0);
    const allInvalid = Object.values(preview).reduce((s, f) => s + f.invalidCount, 0);
    return (
      <div className="space-y-4 mt-4">
        <Row gutter={16}>
          <Col span={8}><Card size="small"><Statistic title="Total Records" value={allValid + allInvalid} /></Card></Col>
          <Col span={8}><Card size="small"><Statistic title="Valid (will migrate)" value={allValid} valueStyle={{ color: "#16a34a" }} /></Card></Col>
          <Col span={8}><Card size="small"><Statistic title="Invalid (will skip)" value={allInvalid} valueStyle={{ color: "#dc2626" }} /></Card></Col>
        </Row>
        <Collapse items={Object.entries(preview).map(([key, file]) => ({
          key,
          label: `${file.label} (${file.validCount} valid / ${file.invalidCount} invalid)`,
          children: (
            <div className="space-y-3">
              {file.invalidList?.length > 0 && (
                <Alert type="warning" showIcon message={`${file.invalidCount} records will be skipped`}
                  description={
                    <List size="small" dataSource={file.invalidList.slice(0, 10)} renderItem={(item) => (
                      <List.Item>
                        <Text code>#{item.index}</Text> {item.displayName || "(no name)"}
                        {item.missingName && <Tag color="red">missing name</Tag>}
                        {item.missingPhone && <Tag color="red">missing phone</Tag>}
                        {item.missingJoinDate && <Tag color="red">missing join date</Tag>}
                        {item.missingDob && <Tag color="orange">missing/invalid DOB</Tag>}
                        {item.missingAgeGroup && <Tag color="orange">no age group match</Tag>}
                      </List.Item>
                    )} />
                  } />
              )}
              {file.invalidList?.length > 0 && (
                <Button size="small" icon={<DownloadOutlined />} onClick={() => {
                  const rows = file.invalidList.map((r) => ({
                    yojna: file.label, ...r,
                  }));
                  downloadCSV(rows, `skip_list_${key}.csv`, [
                    { label: "Yojna", accessor: (r) => r.yojna },
                    { label: "Name", accessor: (r) => r.displayName || "(no name)" },
                    { label: "Raw DOB", accessor: (r) => r.rawDob || "" },
                    { label: "Raw Join Date", accessor: (r) => r.rawJoinDate || "" },
                    { label: "Phone", accessor: (r) => r.rawPhone || "" },
                    { label: "Old Member ID", accessor: (r) => r.oldMemberId || "" },
                    { label: "Reason", accessor: (r) => {
                      const reasons = [];
                      if (r.missingName) reasons.push("missing name");
                      if (r.missingPhone) reasons.push("missing phone");
                      if (r.missingJoinDate) reasons.push("missing/invalid join date");
                      if (r.missingDob) reasons.push("missing/invalid DOB");
                      if (r.missingAgeGroup) reasons.push(r._extraSkipReason || "no age group match");
                      return reasons.join("; ") || "unknown";
                    }},
                  ]);
                }}>Download Skip List CSV</Button>
              )}
              <Collapse ghost items={[{
                key: "agents", label: `Unique Agents (${file.uniqueAgents?.length || 0})`,
                children: <div className="flex flex-wrap gap-1">{(file.uniqueAgents || []).map((a) => <Tag key={a}>{a}</Tag>)}</div>,
              }]} />
              <Table size="small" dataSource={file.sample} rowKey="index" pagination={false}
                columns={[
                  { title: "#", dataIndex: "index", width: 50 },
                  { title: "Name", dataIndex: "displayName", width: 150 },
                  { title: "Phone", dataIndex: "phone", width: 120 },
                  { title: "DOB", dataIndex: "bobDate", width: 100, render: (v) => v || <Text type="danger">INVALID</Text> },
                  { title: "Join Date", dataIndex: "dateJoin", width: 100, render: (v) => v || <Text type="danger">INVALID</Text> },
                  { title: "District", dataIndex: "district", width: 100 },
                  { title: "State", dataIndex: "state", width: 100 },
                  { title: "Agent", dataIndex: "agentRaw", width: 150, ellipsis: true },
                ]} />
            </div>
          ),
        }))} />
      </div>
    );
  };

  const renderResult = () => {
    if (!result) return null;
    const { summary, tables } = result;
    return (
      <div className="space-y-4 mt-4">
        <Alert type={summary.totalErrors > 0 ? "warning" : "success"} showIcon message="Migration Complete"
          description={
            <Row gutter={16}>
              <Col span={6}><Statistic title="Migrated" value={summary.totalMigrated} valueStyle={{ color: "#16a34a" }} /></Col>
              <Col span={6}><Statistic title="Skipped" value={summary.totalSkipped} /></Col>
              <Col span={6}><Statistic title="Errors" value={summary.totalErrors} valueStyle={{ color: summary.totalErrors > 0 ? "#dc2626" : undefined }} /></Col>
              <Col span={6}><Statistic title="Final Count" value={summary.finalMemberCount} /></Col>
            </Row>
          } />
        <div className="mb-2">
          <Button size="small" icon={<DownloadOutlined />} onClick={() => {
            const skipped = Object.entries(tables).flatMap(([key, t]) =>
              t.details.filter((d) => d.status === "skipped").map((d) => ({ yojna: FILE_LABELS[key], ...d }))
            );
            if (!skipped.length) { message.info("No skipped records"); return; }
            downloadCSV(skipped, "skipped_members.csv", [
              { label: "Yojna", accessor: (r) => r.yojna },
              { label: "Name", accessor: (r) => r.name },
              { label: "Reason", accessor: (r) => r.reason },
              { label: "Old Member ID", accessor: (r) => r.oldMemberId },
              { label: "Raw DOB", accessor: (r) => r.rawDob || "" },
              { label: "Raw Join Date", accessor: (r) => r.rawJoinDate || "" },
            ]);
          }}>Download Skipped CSV</Button>
        </div>
        <Collapse items={Object.entries(tables).map(([key, table]) => ({
          key,
          label: `${FILE_LABELS[key]} — ${table.success} added, ${table.skipped} skipped, ${table.errors} errors`,
          children: (
            <Table size="small" dataSource={table.details} rowKey={(r) => `${r.index}-${r.status}`} pagination={{ pageSize: 10 }}
              columns={[
                { title: "#", dataIndex: "index", width: 50 },
                { title: "Name", dataIndex: "name", width: 150, ellipsis: true },
                { title: "App No", dataIndex: "appNo", width: 80 },
                { title: "Status", dataIndex: "status", width: 100, render: (v) => {
                  const color = v === "migrated" ? "green" : v === "skipped" ? "orange" : "red";
                  return <Tag color={color}>{v}</Tag>;
                }},
                { title: "Reg No", dataIndex: "regNo", width: 100 },
                { title: "Agent", dataIndex: "agentName", width: 150, ellipsis: true },
                { title: "Reason/Error", dataIndex: "reason", width: 200, ellipsis: true, render: (v) => v || "" },
              ]} />
          ),
        }))} />
      </div>
    );
  };

  return (
    <div>
      <Card>
        <Title level={4}>Excel Data Migration</Title>
        <Text type="secondary">
          Migrate member data from Excel-converted JSON files (mayra.json, vivah.json)
          to a selected program. Handles Hindi dates, district/state normalization,
          age group matching, and agent assignment.
        </Text>
        <Divider />
        <Space direction="vertical" className="w-full" size="middle">
          <div>
            <Text strong>Select Program</Text>
            <Select className="w-full mt-1" size="large" placeholder="Choose a program"
              value={selectedProgram?.id || undefined}
              onChange={(id) => setSelectedProgram(programList.find((p) => p.id === id) || null)}
              options={programList.map((p) => ({ label: p.name, value: p.id }))} />
          </div>
          <div>
            <Text strong>Files to Migrate</Text>
            <Select className="w-full mt-1" mode="multiple" size="large"
              value={selectedFiles} onChange={setSelectedFiles} options={FILE_OPTIONS} />
          </div>
          <Divider />
          <Space>
            <Button icon={<EyeOutlined />} onClick={handlePreview} loading={loading} disabled={!selectedProgram}>Preview</Button>
            <Button type="primary" icon={<CloudUploadOutlined />} onClick={handleMigrate}
              loading={loading} disabled={!selectedProgram || selectedFiles.length === 0}>Start Migration</Button>
            <Button danger icon={<DeleteOutlined />} onClick={handleRevert}
              loading={loading} disabled={!selectedProgram}>Revert</Button>
          </Space>
        </Space>
        {loading && (
          <div className="text-center py-10">
            <Spin size="large" />
            <div className="mt-4"><Text strong>Processing... this may take a few minutes</Text></div>
          </div>
        )}
        {!loading && preview && renderPreview()}
        {!loading && result && renderResult()}
      </Card>

      <Modal title={confirmModal?.title} open={!!confirmModal}
        onOk={confirmModal?.onOk} onCancel={() => setConfirmModal(null)}
        okText="Confirm" cancelText="Cancel" okButtonProps={{ danger: confirmModal?.danger }}>
        <div className="flex items-start gap-3">
          {confirmModal?.danger
            ? <WarningOutlined style={{ fontSize: 24, color: "#dc2626" }} />
            : <InfoCircleOutlined style={{ fontSize: 24, color: "#1890ff" }} />}
          <Text>{confirmModal?.content}</Text>
        </div>
      </Modal>
    </div>
  );
};

export default ExcelDataMigration;
