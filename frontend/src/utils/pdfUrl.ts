/**
 * Fetch a signed URL for opening a PDF in the browser.
 *
 * The backend endpoints `/{kind}/{id}/pdf-url` return a short-lived URL
 * with an HMAC-signed `?t=` token so we can open the PDF in a new tab
 * or modal without leaking auth (browser tab can't send Authorization
 * headers on inline navigation).
 *
 * Usage:
 *
 *   const url = await getSignedPdfUrl('factura', factura.id);
 *   window.open(url, '_blank');
 *
 * The returned URL has TTL 5 minutes — enough for the browser to load
 * the PDF, not enough to be useful if leaked.
 */
import { apiGet } from './apiClient';

type SignedUrlKind = 'factura' | 'contrato';

interface SignedUrlResponse {
    url: string;
    expires_in_seconds: number;
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export async function getSignedPdfUrl(kind: SignedUrlKind, resourceId: number): Promise<string> {
    const endpoint = kind === 'factura'
        ? `/api/facturas/${resourceId}/pdf-url`
        : `/api/contratos/${resourceId}/pdf-url`;

    const res = await apiGet<SignedUrlResponse>(endpoint);
    // Backend returns a relative path (/api/...); prepend the API host.
    return `${API_URL}${res.url}`;
}
