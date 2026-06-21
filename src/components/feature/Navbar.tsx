import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const STAFF_ROLES = new Set(["cozinha", "caixa", "admin", "atendente", "entregador"]);

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: "Início", path: "/" },
    { label: "Cardápio", path: "/cardapio" },
    { label: "Pedidos", path: "/pedidos" },
    { label: "Delivery", path: "/delivery" },
    { label: "Reservas", path: "/reservas" },
  ];

  const loggedInNavLinks = user
    ? [
        { label: "Meus Pedidos", path: "/meus-pedidos" },
      ]
    : [];

  const staffLinks = [
    { label: "Cozinha", path: "/cozinha", icon: "ri-restaurant-line", roles: ["cozinha", "admin"] },
    { label: "Caixa", path: "/caixa", icon: "ri-coins-line", roles: ["caixa", "admin"] },
    { label: "Admin", path: "/admin", icon: "ri-dashboard-line", roles: ["admin", "atendente", "caixa"] },
    { label: "QR Mesas", path: "/qrcode-mesas", icon: "ri-qr-code-line", roles: ["caixa", "admin"] },
    { label: "Entregas", path: "/entregas", icon: "ri-truck-line", roles: ["entregador", "admin"] },
  ];

  const isStaff = user?.role && STAFF_ROLES.has(user.role);
  const visibleStaffLinks = isStaff
    ? staffLinks.filter((link) => link.roles.includes(user.role || "cliente"))
    : [];

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-white/95 backdrop-blur-md shadow-sm py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="w-full px-4 sm:px-6 lg:px-12 flex items-center justify-between">
        <Link
          to="/"
          className={`font-display font-bold text-2xl tracking-tight transition-colors ${
            scrolled ? "text-np-purple-800" : "text-white"
          }`}
        >
          <span className="font-['Pacifico']">NP</span>
          <span className="text-sm font-body font-normal ml-2 hidden sm:inline">
            Empório
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`font-body text-sm font-medium transition-colors hover:text-np-gold-500 ${
                isActive(link.path)
                  ? scrolled
                    ? "text-np-purple-600"
                    : "text-white"
                  : scrolled
                    ? "text-gray-700"
                    : "text-white/80"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {loggedInNavLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`font-body text-sm font-medium transition-colors hover:text-np-gold-500 ${
                isActive(link.path)
                  ? scrolled
                    ? "text-np-purple-600"
                    : "text-white"
                  : scrolled
                    ? "text-gray-700"
                    : "text-white/80"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {/* Staff Dropdown — só aparece para staff */}
          {visibleStaffLinks.length > 0 && (
          <div className="relative group">
            <button
              className={`font-body text-sm font-medium transition-colors hover:text-np-gold-500 flex items-center gap-1 ${
                scrolled ? "text-gray-700" : "text-white/80"
              }`}
            >
              <i className="ri-settings-3-line"></i>
              Equipe
              <i className="ri-arrow-down-s-line text-xs"></i>
            </button>
            <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-np-wood-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
              {visibleStaffLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-np-purple-700 hover:bg-np-purple-50 transition-colors"
                >
                  <i className={link.icon}></i>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          )}

          <Link
            to="/sobre"
            className={`font-body text-sm font-medium transition-colors hover:text-np-gold-500 ${
              isActive("/sobre")
                ? scrolled
                  ? "text-np-purple-600"
                  : "text-white"
                : scrolled
                  ? "text-gray-700"
                  : "text-white/80"
            }`}
          >
            Sobre
          </Link>

          {/* User dropdown */}
          {user ? (
            <div className="relative group">
              <button
                className={`font-body text-sm font-medium transition-colors hover:text-np-gold-500 flex items-center gap-1 ${
                  scrolled ? "text-gray-700" : "text-white/80"
                }`}
              >
                <i className="ri-user-line mr-1"></i>
                {user.full_name || user.email.split("@")[0]}
                <i className="ri-arrow-down-s-line text-xs"></i>
              </button>
              <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-np-wood-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                <Link
                  to="/minha-conta"
                  className="flex items-center gap-2 px-4 py-3 text-sm text-np-purple-700 hover:bg-np-purple-50 transition-colors"
                >
                  <i className="ri-user-settings-line"></i>
                  Minha Conta
                </Link>
                <Link
                  to="/meus-pedidos"
                  className="flex items-center gap-2 px-4 py-3 text-sm text-np-purple-700 hover:bg-np-purple-50 transition-colors"
                >
                  <i className="ri-shopping-bag-3-line"></i>
                  Meus Pedidos
                </Link>
                <div className="border-t border-np-wood-100">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-np-red hover:bg-red-50 transition-colors text-left"
                  >
                    <i className="ri-logout-box-line"></i>
                    Sair
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Link
              to="/login"
              className="bg-np-gold-500 hover:bg-np-gold-600 text-white px-5 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
            >
              Entrar
            </Link>
          )}
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className={`md:hidden w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            scrolled ? "text-np-purple-800" : "text-white"
          }`}
        >
          <i className={`ri-${mobileOpen ? "close" : "menu"}-line text-2xl`} />
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white shadow-lg border-t border-gray-100">
          <div className="px-4 py-4 flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileOpen(false)}
                className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.path)
                    ? "bg-np-purple-50 text-np-purple-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {/* Meus Pedidos no mobile */}
            {user && (
              <Link
                to="/meus-pedidos"
                onClick={() => setMobileOpen(false)}
                className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive("/meus-pedidos")
                    ? "bg-np-purple-50 text-np-purple-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <i className="ri-shopping-bag-3-line mr-1"></i>
                Meus Pedidos
              </Link>
            )}
            {/* Staff links no mobile — só para staff */}
            {visibleStaffLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileOpen(false)}
                className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.path)
                    ? "bg-np-purple-50 text-np-purple-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <i className={link.icon}></i>
                {link.label}
              </Link>
            ))}
            {user && (
            <Link
              to="/minha-conta"
              onClick={() => setMobileOpen(false)}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive("/minha-conta")
                  ? "bg-np-purple-50 text-np-purple-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <i className="ri-user-line mr-1"></i>
              Minha Conta
            </Link>
            )}
            {user ? (
              <div className="px-4 py-3 border-t border-gray-100 mt-2">
                <p className="text-sm font-medium text-np-purple-800 mb-2">
                  <i className="ri-user-smile-line mr-1"></i>
                  {user.full_name || user.email}
                </p>
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileOpen(false);
                  }}
                  className="text-sm text-np-red hover:text-red-600 transition-colors"
                >
                  <i className="ri-logout-box-line mr-1"></i>
                  Sair da conta
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="bg-np-gold-500 text-white px-4 py-3 rounded-lg text-sm font-medium text-center mt-2"
              >
                Entrar
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;