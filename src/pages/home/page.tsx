import Navbar from "../../components/feature/Navbar";
import Footer from "../../components/feature/Footer";
import WhatsAppButton from "../../components/feature/WhatsAppButton";
import HeroSection from "./components/HeroSection";
import MenuSection from "./components/MenuSection";
import LocationSection from "./components/LocationSection";
import TestimonialsSection from "./components/TestimonialsSection";
import CTAReservas from "./components/CTAReservas";

const HomePage = () => {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main>
        <HeroSection />
        <MenuSection />
        <CTAReservas />
        <TestimonialsSection />
        <LocationSection />
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
};

export default HomePage;