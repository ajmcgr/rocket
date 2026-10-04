import { ArrowRight, CreditCard, ShieldCheck } from "lucide-react";
import { Link } from "@/lib/router-compat";
import "./developer-product-cards.css";

export default function DeveloperProductCards({ appId }: { appId?: string }) {
  const suffix = appId ? `?app=${encodeURIComponent(appId)}` : "";
  return <section className="rocket-product-cards" aria-label="Build with Rocket Developer">
    <div className="rocket-product-cards-heading">
      <h3>Turn discovery into customers.</h3>
      <p>Two ways to connect your app with Rocket users.</p>
    </div>
    <div className="rocket-product-cards-grid">
      <article className="rocket-product-card rocket-product-card-buy">
        <span className="rocket-product-icon"><CreditCard size={24} aria-hidden="true" /></span>
        <h3>Buy with Rocket</h3>
        <p>Sell access directly from your Rocket listing. Connect Stripe, set your price, and give buyers a clear path to purchase.</p>
        <span className="rocket-product-detail">5% platform fee · Stripe processing fees separate</span>
        <Link className="rocket-product-cta" to={`/buy-with-rocket${suffix}`}>Start selling <ArrowRight size={18} aria-hidden="true" /></Link>
      </article>
      <article className="rocket-product-card rocket-product-card-id">
        <span className="rocket-product-icon"><ShieldCheck size={24} aria-hidden="true" /></span>
        <h3>Rocket ID</h3>
        <p>Let Rocket users sign in to your app with their existing account. Give new customers a simpler way to get started.</p>
        <span className="rocket-product-detail">Connected identity · Secure OAuth sign-in</span>
        <Link className="rocket-product-cta" to={`/rocket-id${suffix}`}>Set up Rocket ID <ArrowRight size={18} aria-hidden="true" /></Link>
      </article>
    </div>
    <p className="rocket-product-cards-note">Available with Rocket Developer ($99/year). Verified app ownership and integration setup are required; selling also requires Stripe approval.</p>
  </section>;
}
