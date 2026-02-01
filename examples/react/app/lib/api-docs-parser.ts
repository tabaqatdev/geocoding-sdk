/**
 * Parse TypeDoc JSON output for display in React components
 */

// TypeDoc JSON kinds
const KIND = {
  PROJECT: 1,
  MODULE: 2,
  NAMESPACE: 4,
  ENUM: 8,
  VARIABLE: 32,
  FUNCTION: 64,
  CLASS: 128,
  INTERFACE: 256,
  CONSTRUCTOR: 512,
  PROPERTY: 1024,
  METHOD: 2048,
  CALL_SIGNATURE: 4096,
  TYPE_ALIAS: 2097152,
} as const;

export interface MethodInfo {
  name: string;
  signature: string;
  description: string;
  returns: string;
  category: string;
  params: Array<{ name: string; type: string; description: string; optional: boolean }>;
  sourceUrl?: string;
}

export interface InterfaceInfo {
  name: string;
  description: string;
  properties: Array<{
    name: string;
    type: string;
    optional: boolean;
    description: string;
  }>;
}

export interface ParsedApiDocs {
  methods: MethodInfo[];
  interfaces: InterfaceInfo[];
  generatedAt?: string;
}

// Category mapping based on method names
const METHOD_CATEGORIES: Record<string, string> = {
  initialize: "Initialization",
  close: "Initialization",
  setDebug: "Debug & Cache",
  clearCache: "Debug & Cache",
  geocode: "Forward Geocoding",
  geocodeCached: "Forward Geocoding",
  geocodeFTS: "Forward Geocoding",
  smartGeocode: "Forward Geocoding",
  getAutocompleteSuggestions: "Forward Geocoding",
  reverseGeocode: "Reverse Geocoding",
  searchByPostcode: "Specialized Search",
  searchByNumber: "Specialized Search",
  detectCountry: "Location Detection",
  isInSaudiArabia: "Location Detection",
  getAdminHierarchy: "Location Detection",
  getTiles: "Tile Management",
  getLoadedTiles: "Tile Management",
  getTilesByRegion: "Tile Management",
  getTilesForBbox: "Tile Management",
  getPostcodes: "Postcode Index",
  getStats: "Stats & Diagnostics",
  isFTSAvailable: "Stats & Diagnostics",
  getSearchMode: "Stats & Diagnostics",
};

function getTypeString(type: unknown): string {
  if (!type || typeof type !== "object") return "unknown";

  const t = type as Record<string, unknown>;

  switch (t.type) {
    case "intrinsic":
      return t.name as string;

    case "reference":
      if (t.typeArguments && Array.isArray(t.typeArguments)) {
        const args = (t.typeArguments as unknown[]).map(getTypeString).join(", ");
        return `${t.name}<${args}>`;
      }
      return t.name as string;

    case "array":
      return `${getTypeString(t.elementType)}[]`;

    case "union":
      if (Array.isArray(t.types)) {
        return (t.types as unknown[]).map(getTypeString).join(" | ");
      }
      return "unknown";

    case "literal":
      if (typeof t.value === "string") return `"${t.value}"`;
      return String(t.value);

    case "tuple":
      if (Array.isArray(t.elements)) {
        return `[${(t.elements as unknown[]).map(getTypeString).join(", ")}]`;
      }
      return "[]";

    case "reflection":
      if (t.declaration && typeof t.declaration === "object") {
        const decl = t.declaration as Record<string, unknown>;
        if (decl.children && Array.isArray(decl.children)) {
          const props = (decl.children as Array<Record<string, unknown>>)
            .map((c) => {
              const optional = c.flags && (c.flags as Record<string, boolean>).isOptional;
              return `${c.name}${optional ? "?" : ""}: ${getTypeString(c.type)}`;
            })
            .join("; ");
          return `{ ${props} }`;
        }
        if (decl.signatures && Array.isArray(decl.signatures)) {
          return "Function";
        }
      }
      return "object";

    default:
      return "unknown";
  }
}

function getCommentText(comment: unknown): string {
  if (!comment || typeof comment !== "object") return "";

  const c = comment as Record<string, unknown>;
  if (c.summary && Array.isArray(c.summary)) {
    return (c.summary as Array<{ text?: string }>)
      .map((part) => part.text || "")
      .join("")
      .trim();
  }

  return "";
}

function parseMethod(method: Record<string, unknown>): MethodInfo | null {
  const name = method.name as string;
  if (!name || name.startsWith("_")) return null;

  // Get signature from the first signature
  const signatures = method.signatures as Array<Record<string, unknown>> | undefined;
  const sig = signatures?.[0];
  if (!sig) return null;

  // Build parameters
  const params: MethodInfo["params"] = [];
  const sigParams = sig.parameters as Array<Record<string, unknown>> | undefined;
  if (sigParams) {
    for (const p of sigParams) {
      const flags = p.flags as Record<string, boolean> | undefined;
      params.push({
        name: p.name as string,
        type: getTypeString(p.type),
        description: getCommentText(p.comment),
        optional: !!flags?.isOptional,
      });
    }
  }

  // Build signature string
  const paramStr = params.map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`).join(", ");
  const returnType = getTypeString(sig.type);
  const signature = `${name}(${paramStr}): ${returnType}`;

  // Get source URL
  const sources = method.sources as Array<{ url?: string }> | undefined;
  const sourceUrl = sources?.[0]?.url;

  return {
    name,
    signature,
    description: getCommentText(sig.comment),
    returns: returnType,
    category: METHOD_CATEGORIES[name] || "Other",
    params,
    sourceUrl,
  };
}

function parseInterface(iface: Record<string, unknown>): InterfaceInfo | null {
  const name = iface.name as string;
  if (!name) return null;

  const properties: InterfaceInfo["properties"] = [];
  const children = iface.children as Array<Record<string, unknown>> | undefined;

  if (children) {
    for (const child of children) {
      if ((child.kind as number) === KIND.PROPERTY) {
        const flags = child.flags as Record<string, boolean> | undefined;
        properties.push({
          name: child.name as string,
          type: getTypeString(child.type),
          optional: !!flags?.isOptional,
          description: getCommentText(child.comment),
        });
      }
    }
  }

  return {
    name,
    description: getCommentText(iface.comment),
    properties,
  };
}

export function parseTypeDocJson(json: unknown): ParsedApiDocs {
  const methods: MethodInfo[] = [];
  const interfaces: InterfaceInfo[] = [];

  if (!json || typeof json !== "object") {
    return { methods, interfaces };
  }

  const root = json as Record<string, unknown>;
  const children = root.children as Array<Record<string, unknown>> | undefined;

  if (!children) {
    return { methods, interfaces };
  }

  for (const child of children) {
    const kind = child.kind as number;

    // Parse interfaces
    if (kind === KIND.INTERFACE) {
      const iface = parseInterface(child);
      if (iface) interfaces.push(iface);
    }

    // Parse class (GeoSDK)
    if (kind === KIND.CLASS && child.name === "GeoSDK") {
      const classChildren = child.children as Array<Record<string, unknown>> | undefined;
      if (classChildren) {
        for (const member of classChildren) {
          if ((member.kind as number) === KIND.METHOD) {
            const method = parseMethod(member);
            if (method) methods.push(method);
          }
        }
      }
    }
  }

  // Sort methods by category
  const categoryOrder = [
    "Initialization",
    "Forward Geocoding",
    "Reverse Geocoding",
    "Specialized Search",
    "Location Detection",
    "Tile Management",
    "Postcode Index",
    "Stats & Diagnostics",
    "Debug & Cache",
    "Other",
  ];

  methods.sort((a, b) => {
    const aIdx = categoryOrder.indexOf(a.category);
    const bIdx = categoryOrder.indexOf(b.category);
    return aIdx - bIdx;
  });

  return { methods, interfaces };
}
