import React from 'react';
import { createRoot } from 'react-dom/client';
import OrbitCheckout from './OrbitCheckout';

const OBSERVED = ['plan-id', 'merchant-address', 'network', 'locale', 'theme'];

class OrbitCheckoutElement extends HTMLElement {
  static get observedAttributes() {
    return OBSERVED;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._root = createRoot(this.shadowRoot);
    this._forwardEvent = (event) => {
      this.dispatchEvent(new CustomEvent(event.type, { detail: event.detail }));
    };
    for (const type of ['orbit:success', 'orbit:error', 'orbit:close']) {
      window.addEventListener(type, this._forwardEvent);
    }
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  render() {
    this._root.render(
      <OrbitCheckout
        planId={this.getAttribute('plan-id') || undefined}
        theme={this.getAttribute('theme') || 'auto'}
        networkPassphrase={this.getAttribute('network') || undefined}
        merchantAddress={this.getAttribute('merchant-address') || undefined}
        locale={this.getAttribute('locale') || undefined}
      />,
    );
  }

  disconnectedCallback() {
    for (const type of ['orbit:success', 'orbit:error', 'orbit:close']) {
      window.removeEventListener(type, this._forwardEvent);
    }
    this._root.unmount();
  }
}

if (!customElements.get('orbit-checkout')) {
  customElements.define('orbit-checkout', OrbitCheckoutElement);
}

export { OrbitCheckoutElement };
