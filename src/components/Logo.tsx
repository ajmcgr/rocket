import { Link } from "react-router-dom";
import rocketLogo from "@/assets/rocket-logo-color.png.asset.json";

type Props = { to?: string; size?: "sm" | "md" | "lg"; className?: string };

const Logo = ({ to = "/", size = "md", className = "" }: Props) => {
  const h = size === "sm" ? "h-8" : size === "lg" ? "h-14" : "h-11";
  const body = (
    <img src={rocketLogo.url} alt="Rocket" className={`${h} block w-auto object-contain ${className}`} />
  );
  return to ? <Link to={to} className="inline-flex items-center">{body}</Link> : body;
};

export default Logo;
