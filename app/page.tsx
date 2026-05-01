import TreeGenerator from "@/components/TreeGenerator";

export default function Home() {
  return (
    <div className="page-bg">
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "56px 20px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "800px" }}>
          <TreeGenerator />
        </div>
      </div>
    </div>
  );
}