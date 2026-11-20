/**
 * Lightweight i18n for the OrbitCheckout widget (#264).
 *
 * Supported locales: en, es, pt, fr, ja.
 * Falls back to 'en' when the requested locale is missing.
 * Supports {variable} interpolation via t(key, { variable: value }).
 */

export const SUPPORTED_LOCALES = ['en', 'es', 'pt', 'fr', 'ja'];

const dictionaries = {
  en: {
    connect_wallet: 'Connect Wallet',
    connecting: 'Connecting…',
    disconnect: 'Disconnect',
    subscribe: 'Subscribe',
    subscribing: 'Processing…',
    per_month: 'per month',
    amount: '{amount} USDC',
    plan_not_found: 'Plan not found.',
    success_title: 'Subscription activated!',
    success_body: 'Your recurring payment has been confirmed on the Stellar ledger.',
    pending_title: 'Confirming transaction…',
    pending_body: 'Verifying your payment on the Stellar network.',
    error_generic: 'Something went wrong. Please try again.',
    wrong_network: 'Wrong network detected. Please switch your wallet to {network}.',
    switch_network: 'Switch network',
    coupon_placeholder: 'Coupon code',
    coupon_apply: 'Apply',
    coupon_remove: 'Remove',
    hardware_wallet_prompt: 'Please verify and confirm on your hardware device.',
    hardware_wallet_timeout: 'Hardware device confirmation timed out. Check your device and try again.',
    hardware_rejected: 'You rejected the transaction on your device.',
    session_expired: 'Your checkout session expired. Please start over.',
    terms_agree: 'I agree to the {terms} and authorize recurring billing.',
    terms_link: 'Terms of Service',
  },
  es: {
    connect_wallet: 'Conectar billetera',
    connecting: 'Conectando…',
    disconnect: 'Desconectar',
    subscribe: 'Suscribirse',
    subscribing: 'Procesando…',
    per_month: 'por mes',
    amount: '{amount} USDC',
    plan_not_found: 'Plan no encontrado.',
    success_title: '¡Suscripción activada!',
    success_body: 'Tu pago recurrente ha sido confirmado en el ledger de Stellar.',
    pending_title: 'Confirmando transacción…',
    pending_body: 'Verificando tu pago en la red Stellar.',
    error_generic: 'Algo salió mal. Inténtalo de nuevo.',
    wrong_network: 'Red incorrecta detectada. Cambia tu billetera a {network}.',
    switch_network: 'Cambiar red',
    coupon_placeholder: 'Código de cupón',
    coupon_apply: 'Aplicar',
    coupon_remove: 'Quitar',
    hardware_wallet_prompt: 'Por favor verifica y confirma en tu dispositivo de hardware.',
    hardware_wallet_timeout: 'El tiempo de confirmación del dispositivo expiró. Revisa tu dispositivo.',
    hardware_rejected: 'Rechazaste la transacción en tu dispositivo.',
    session_expired: 'Tu sesión de pago expiró. Por favor empieza de nuevo.',
    terms_agree: 'Acepto los {terms} y autorizo el cobro recurrente.',
    terms_link: 'Términos de Servicio',
  },
  pt: {
    connect_wallet: 'Conectar carteira',
    connecting: 'Conectando…',
    disconnect: 'Desconectar',
    subscribe: 'Assinar',
    subscribing: 'Processando…',
    per_month: 'por mês',
    amount: '{amount} USDC',
    plan_not_found: 'Plano não encontrado.',
    success_title: 'Assinatura ativada!',
    success_body: 'Seu pagamento recorrente foi confirmado no ledger Stellar.',
    pending_title: 'Confirmando transação…',
    pending_body: 'Verificando seu pagamento na rede Stellar.',
    error_generic: 'Algo deu errado. Tente novamente.',
    wrong_network: 'Rede incorreta detectada. Mude sua carteira para {network}.',
    switch_network: 'Trocar rede',
    coupon_placeholder: 'Código de cupom',
    coupon_apply: 'Aplicar',
    coupon_remove: 'Remover',
    hardware_wallet_prompt: 'Por favor verifique e confirme no seu dispositivo de hardware.',
    hardware_wallet_timeout: 'Tempo de confirmação do dispositivo expirou. Verifique seu dispositivo.',
    hardware_rejected: 'Você rejeitou a transação no seu dispositivo.',
    session_expired: 'Sua sessão de pagamento expirou. Por favor comece novamente.',
    terms_agree: 'Concordo com os {terms} e autorizo a cobrança recorrente.',
    terms_link: 'Termos de Serviço',
  },
  fr: {
    connect_wallet: 'Connecter le portefeuille',
    connecting: 'Connexion…',
    disconnect: 'Déconnecter',
    subscribe: "S'abonner",
    subscribing: 'Traitement…',
    per_month: 'par mois',
    amount: '{amount} USDC',
    plan_not_found: 'Plan introuvable.',
    success_title: 'Abonnement activé !',
    success_body: 'Votre paiement récurrent a été confirmé sur le ledger Stellar.',
    pending_title: 'Confirmation de la transaction…',
    pending_body: 'Vérification de votre paiement sur le réseau Stellar.',
    error_generic: "Une erreur s'est produite. Veuillez réessayer.",
    wrong_network: 'Mauvais réseau détecté. Basculez votre portefeuille vers {network}.',
    switch_network: 'Changer de réseau',
    coupon_placeholder: 'Code promo',
    coupon_apply: 'Appliquer',
    coupon_remove: 'Supprimer',
    hardware_wallet_prompt: 'Veuillez vérifier et confirmer sur votre appareil matériel.',
    hardware_wallet_timeout: "Délai de confirmation de l'appareil dépassé. Vérifiez votre appareil.",
    hardware_rejected: 'Vous avez rejeté la transaction sur votre appareil.',
    session_expired: 'Votre session de paiement a expiré. Veuillez recommencer.',
    terms_agree: "J'accepte les {terms} et j'autorise la facturation récurrente.",
    terms_link: "Conditions d'utilisation",
  },
  ja: {
    connect_wallet: 'ウォレットを接続',
    connecting: '接続中…',
    disconnect: '切断',
    subscribe: '購読する',
    subscribing: '処理中…',
    per_month: '月額',
    amount: '{amount} USDC',
    plan_not_found: 'プランが見つかりません。',
    success_title: 'サブスクリプションが有効になりました！',
    success_body: 'Stellarレジャーで定期支払いが確認されました。',
    pending_title: 'トランザクションを確認中…',
    pending_body: 'Stellarネットワークでお支払いを確認中です。',
    error_generic: 'エラーが発生しました。もう一度お試しください。',
    wrong_network: 'ネットワークが違います。ウォレットを{network}に切り替えてください。',
    switch_network: 'ネットワークを切り替え',
    coupon_placeholder: 'クーポンコード',
    coupon_apply: '適用',
    coupon_remove: '削除',
    hardware_wallet_prompt: 'ハードウェアデバイスで確認してください。',
    hardware_wallet_timeout: 'デバイスの確認がタイムアウトしました。デバイスを確認してください。',
    hardware_rejected: 'デバイスでトランザクションを拒否しました。',
    session_expired: 'チェックアウトセッションが期限切れです。最初からやり直してください。',
    terms_agree: '{terms}に同意し、定期請求を承認します。',
    terms_link: '利用規約',
  },
};

/**
 * Resolve the best available locale from a user-supplied value or navigator.language.
 * Falls back to 'en' if the requested locale is not supported.
 */
export function resolveLocale(localeProp) {
  const candidates = localeProp
    ? [localeProp]
    : typeof navigator !== 'undefined'
      ? [navigator.language, navigator.language?.split('-')[0]]
      : [];

  for (const candidate of candidates) {
    if (candidate && SUPPORTED_LOCALES.includes(candidate.toLowerCase())) {
      return candidate.toLowerCase();
    }
  }
  return 'en';
}

/**
 * Returns a t() function bound to the resolved locale.
 * Supports {variable} interpolation: t('amount', { amount: '10.00' })
 */
export function createTranslator(locale) {
  const resolved = resolveLocale(locale);
  const dict = dictionaries[resolved] ?? dictionaries.en;

  return function t(key, vars = {}) {
    let str = dict[key] ?? dictionaries.en[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return str;
  };
}
