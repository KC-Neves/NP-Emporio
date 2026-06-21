import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-np-wood-100 border-t border-np-wood-200">
      <div className="w-full px-4 sm:px-6 lg:px-12 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          <div>
            <Link to="/" className="inline-block mb-4">
              <span className="font-['Pacifico'] text-3xl text-np-purple-800">
                NP
              </span>
              <span className="font-display text-np-purple-800 text-lg ml-2">
                Empório
              </span>
            </Link>
            <p className="font-body text-gray-600 text-sm leading-relaxed">
              Cafeteria artesanal e massas ao vivo. Uma experiência gastronômica
              única em Salvador.
            </p>
          </div>

          <div>
            <h4 className="font-display text-np-purple-900 font-bold text-base mb-4">
              Links Rápidos
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/"
                  className="font-body text-gray-600 text-sm hover:text-np-purple-600 transition-colors"
                >
                  Início
                </Link>
              </li>
              <li>
                <Link
                  to="/cardapio"
                  className="font-body text-gray-600 text-sm hover:text-np-purple-600 transition-colors"
                >
                  Cardápio
                </Link>
              </li>
              <li>
                <Link
                  to="/reservas"
                  className="font-body text-gray-600 text-sm hover:text-np-purple-600 transition-colors"
                >
                  Reservas
                </Link>
              </li>
              <li>
                <Link
                  to="/minha-conta"
                  className="font-body text-gray-600 text-sm hover:text-np-purple-600 transition-colors"
                >
                  Minha Conta
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-display text-np-purple-900 font-bold text-base mb-4">
              Contato
            </h4>
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2">
                <i className="ri-map-pin-line text-np-purple-500 mt-0.5 text-sm" />
                <span className="font-body text-gray-600 text-sm">
                  R. Almiro Pinho, Sussuarana Velha, Salvador - BA, 41213-560
                </span>
              </li>
<li className="flex items-center gap-2">
                <i className="ri-whatsapp-line text-np-purple-500 text-sm" />
                <span className="font-body text-gray-600 text-sm">
                  (71) 99385-5732
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-display text-np-purple-900 font-bold text-base mb-4">
              Horários
            </h4>
            <ul className="space-y-2.5">
              <li className="font-body text-gray-600 text-sm">
                Terça a Quinta: 17:00 - 23:30
              </li>
              <li className="font-body text-gray-600 text-sm">
                Sexta e Sábado: 17:00 - 03:00
              </li>
              <li className="font-body text-gray-600 text-sm">
                Domingo: 17:00 - 01:30
              </li>
              <li className="font-body text-gray-500 text-sm">
                Segunda: Fechado
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-np-wood-200 mt-10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-body text-gray-500 text-sm">
            © 2025 NP Empório Massas & Variedades. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://www.instagram.com/np_emporio?igsh=dDc2bjJuenA0YTR6"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-full bg-np-purple-100 flex items-center justify-center text-np-purple-600 hover:bg-np-purple-200 transition-colors"
              aria-label="Instagram"
            >
              <i className="ri-instagram-line text-lg" />
            </a>

          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;