import { contactInfo } from "../../mocks/menuData";

const HEART = "\u2665";

const WhatsAppButton = () => {
  const rawMessage = `Olá! ${HEART} Gostaria de fazer uma reserva na NP Empório.`;
  const message = encodeURIComponent(rawMessage);
  console.log('[WHATSAPP BUTTON] decodeURIComponent test:', decodeURIComponent(message).includes(HEART) ? HEART + ' OK' : HEART + ' FAIL');
  console.log('[WHATSAPP BUTTON] URL will be:', `https://wa.me/${contactInfo.whatsapp}?text=${message}`);

  return (
    <a
      href={`https://wa.me/${contactInfo.whatsapp}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-600 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 hover:shadow-xl"
      aria-label="WhatsApp"
    >
      <i className="ri-whatsapp-line text-2xl" />
    </a>
  );
};

export default WhatsAppButton;