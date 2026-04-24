import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Lista de nomes genéricos/falsos usados para filtrar clientes de teste
const FAKE_CLIENT_NAMES = [
  "exemplo", "teste", "mock", "fake", "ficticia", "fictícia",
  "silva advogados", "clínica sorriso", "techworld", "imobiliária horizonte",
  "cliente 1", "cliente 2", "cliente 3", "cliente 4", "cliente 5",
  "empresa a", "empresa b", "empresa c", "dashboard exemplo",
  "demo", "amostra", "modelo", "padrão", "padrao"
];

/**
 * Verifica se um nome de cliente é genérico/fictício de teste.
 * Centralizado para evitar duplicação em múltiplos componentes.
 */
export function isFakeClient(name: string | null | undefined): boolean {
  if (!name || name.trim() === "") return true;
  const nameLower = name.toLowerCase();
  const isGenericPattern = /^(cliente|empresa|teste|exemplo)\s*\d*$/i.test(nameLower);
  return isGenericPattern || FAKE_CLIENT_NAMES.some(fake => nameLower.includes(fake));
}

/**
 * Formata um valor em Reais (BRL) com o padrão brasileiro.
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
