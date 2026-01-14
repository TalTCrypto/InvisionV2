import { InstagramIcon } from "~/components/ui/svgs/instagramIcon";
import { Youtube } from "~/components/ui/svgs/youtube";
import { Twitter } from "~/components/ui/svgs/twitter";
import { Linkedin } from "~/components/ui/svgs/linkedin";
import { FacebookIcon } from "~/components/ui/svgs/facebookIcon";
import { Google } from "~/components/ui/svgs/google";
import { Notion } from "~/components/ui/svgs/notion";
import { Slack } from "~/components/ui/svgs/slack";
import { Shopify } from "~/components/ui/svgs/shopify";
import { Stripe } from "~/components/ui/svgs/stripe";
import { Link2 } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Mapping des slugs Composio vers nos composants d'icônes SVG
 */
const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  instagram: InstagramIcon,
  youtube: Youtube,
  twitter: Twitter,
  linkedin: Linkedin,
  facebook: FacebookIcon,
  googlecalendar: Google,
  google: Google,
  notion: Notion,
  slack: Slack,
  shopify: Shopify,
  stripe: Stripe,
};

/**
 * Récupère l'icône pour une intégration donnée
 */
export function getIntegrationIcon(
  slug: string,
): ComponentType<{ className?: string }> {
  const normalizedSlug = slug.toLowerCase().replace(/\s+/g, "");
  return ICON_MAP[normalizedSlug] ?? Link2;
}
