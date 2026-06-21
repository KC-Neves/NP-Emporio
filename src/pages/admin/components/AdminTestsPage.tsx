import OperationalTestTab from "./OperationalTestTab";
import StockTestTab from "./StockTestTab";
import RolePermissionTestTab from "./RolePermissionTestTab";

export default function AdminTestsPage() {
  return (
    <div className="space-y-10">
      <RolePermissionTestTab />
      <div className="border-t border-np-wood-200 pt-10">
        <OperationalTestTab />
      </div>
      <div className="border-t border-np-wood-200 pt-10">
        <StockTestTab />
      </div>
    </div>
  );
}