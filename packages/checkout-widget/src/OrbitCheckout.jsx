import React, { useState, useEffect } from 'react';
import { isConnected, requestAccess } from '@stellar/freighter-api';
import { motion, AnimatePresence } from 'framer-motion';

const DEMO_WALLET = "GBXQ4T7W91LK3PMZ0VR82C5E7NDF6U9H4YJ2A8S";
const FREIGHTER_INSTALL_URL = "https://www.freighter.app/";

const OrbitCheckout = ({ planId, planData, apiUrl = 'http://localhost:3001', demo = false }) => {
    const [plan, setPlan] = useState(planData || null);
    const [loading, setLoading] = useState(!planData);
    const [error, setError] = useState(null);
    const [subscribeError, setSubscribeError] = useState(null);
    const [userAddress, setUserAddress] = useState(null);
    const [isSubscribing, setIsSubscribing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [needsFreighter, setNeedsFreighter] = useState(false);

    const [retryCount, setRetryCount] = useState(0);

    // Import Inter font dynamically if not present
    useEffect(() => {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }, []);

    useEffect(() => {
        if (planData) {
            setPlan(planData);
            setLoading(false);
            setError(null);
            return;
        }

        if (!planId) {
            setError("No planId provided.");
            setLoading(false);
            return;
        }

        let isMounted = true;
        setLoading(true);
        setError(null);

        const fetchPlan = async () => {
            try {
                const response = await fetch(`${apiUrl}/plans/${planId}`);
                if (!response.ok) throw new Error("Failed to fetch plan");
                const data = await response.json();
                if (isMounted) {
                    setPlan(data.plan);
                    setError(null);
                }
            } catch (err) {
                console.warn("Could not load plan from API:", err);
                if (isMounted) {
                    setPlan(null);
                    setError("Unable to load plan. Please check your connection or try again.");
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchPlan();

        return () => {
            isMounted = false;
        };
    }, [planId, planData, apiUrl, retryCount]);

    const handleRetry = () => {
        setRetryCount(count => count + 1);
    };

    const handleConnect = async () => {
        setNeedsFreighter(false);
        try {
            const connected = await isConnected();
            if (connected) {
                const result = await requestAccess();
                const address = typeof result === 'string' ? result : result.address;
                if (address) {
                    setUserAddress(address);
                    setSubscribeError(null);
                    return;
                }
            }
        } catch (err) {
            console.warn("Freighter connection error:", err);
        }

        if (demo) {
            setUserAddress(DEMO_WALLET);
            setSubscribeError(null);
            return;
        }

        setNeedsFreighter(true);
    };

    const handleSubscribe = async () => {
        setIsSubscribing(true);
        setSubscribeError(null);
        try {
            const response = await fetch(`${apiUrl}/subscriptions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan_id: planId,
                    customer_wallet_address: userAddress
                })
            });

            let payload = {};
            try {
                payload = await response.json();
            } catch {
                payload = {};
            }

            if (response.status !== 201) {
                const message = payload.error || payload.message || `Subscription failed (${response.status})`;
                setSubscribeError(message);
                return;
            }

            setSuccess(true);
        } catch (err) {
            console.error("Subscription error:", err);
            setSubscribeError(err.message || "Failed to complete subscription. Try again.");
        } finally {
            setIsSubscribing(false);
        }
    };

    if (loading) return <div style={styles.container}>Loading Orbit checkout...</div>;
    if (error) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <h2 style={{ ...styles.title, color: '#ff5555' }}>Unable to load plan</h2>
                    <p style={styles.errorMessage}>{error}</p>
                </div>
                <button style={styles.primaryButton} onClick={handleRetry}>
                    Try again
                </button>
            </div>
        );
    }
    if (!plan) return <div style={styles.container}>Plan not found.</div>;

    const displayAmount = (plan.usdc_amount / 10000000).toFixed(2);

    return (
        <div style={styles.container}>
            <AnimatePresence mode="wait">
                {success ? (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        style={styles.successState}
                    >
                        <motion.div 
                            initial={{ scale: 0 }} 
                            animate={{ scale: 1 }} 
                            transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
                            style={styles.checkmark}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17L4 12" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </motion.div>
                        <h2 style={styles.successTitle}>Payment Approved</h2>
                        <p style={styles.successSubtitle}>You are now subscribed to {plan.name}.</p>
                    </motion.div>
                ) : (
                    <motion.div
                        key="checkout"
                        exit={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
                        transition={{ duration: 0.3 }}
                    >
                        <div style={styles.header}>
                            <h2 style={styles.title}>{plan.name}</h2>
                            <p style={styles.merchant}>by {plan.merchants?.name}</p>
                        </div>
                        
                        <div style={styles.priceContainer}>
                            <span style={styles.price}>${displayAmount}</span>
                            <span style={styles.currency}> USDC</span>
                        </div>
                        
                        <div style={styles.interval}>
                            Billed every {plan.interval_seconds / 86400} days
                        </div>

                        {!userAddress ? (
                            <>
                                <button style={styles.primaryButton} onClick={handleConnect}>
                                    Connect Freighter Wallet
                                </button>
                                {needsFreighter && (
                                    <p style={styles.errorMessage}>
                                        Install Freighter to continue.{' '}
                                        <a href={FREIGHTER_INSTALL_URL} target="_blank" rel="noreferrer" style={styles.link}>
                                            Get Freighter
                                        </a>
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                <div style={styles.connectedText}>
                                    <span style={styles.connectedDot}></span>
                                    {userAddress.slice(0, 5)}...{userAddress.slice(-4)}
                                </div>
                                {subscribeError && (
                                    <p style={styles.errorMessage}>{subscribeError}</p>
                                )}
                                <button 
                                    style={{ ...styles.primaryButton, opacity: isSubscribing ? 0.7 : 1 }} 
                                    onClick={handleSubscribe}
                                    disabled={isSubscribing}
                                >
                                    {isSubscribing ? "Approving..." : "Subscribe & Approve"}
                                </button>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// Strict Brand.md styling
const styles = {
    container: {
        backgroundColor: '#000000', // Black
        border: '1px solid #2C2C2C', // Black Ash
        padding: '32px 24px',
        borderRadius: '12px',
        maxWidth: '340px',
        fontFamily: "'Inter', sans-serif",
        color: '#FFFFFF', // White text
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
    },
    header: {
        marginBottom: '24px'
    },
    title: {
        margin: '0 0 8px 0',
        fontSize: '20px',
        fontWeight: '500',
        letterSpacing: '-0.02em'
    },
    merchant: {
        margin: 0,
        color: '#888888',
        fontSize: '14px'
    },
    errorMessage: {
        margin: '8px 0 0 0',
        color: '#AAAAAA',
        fontSize: '14px',
        lineHeight: '1.4'
    },
    link: {
        color: '#FFFFFF',
        textDecoration: 'underline'
    },
    priceContainer: {
        marginBottom: '8px'
    },
    price: {
        fontSize: '40px',
        fontWeight: '700',
        letterSpacing: '-0.04em'
    },
    currency: {
        fontSize: '16px',
        color: '#888888',
        fontWeight: '500'
    },
    interval: {
        fontSize: '14px',
        color: '#888888',
        marginBottom: '32px'
    },
    primaryButton: {
        width: '100%',
        padding: '14px',
        backgroundColor: '#FFFFFF', // White background
        color: '#000000', // Black text
        border: 'none',
        borderRadius: '8px',
        fontSize: '16px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'opacity 0.2s ease',
        letterSpacing: '-0.01em'
    },
    connectedText: {
        fontSize: '13px',
        color: '#FFFFFF',
        marginBottom: '16px',
        fontWeight: '500',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px'
    },
    connectedDot: {
        width: '8px',
        height: '8px',
        backgroundColor: '#FFFFFF',
        borderRadius: '50%'
    },
    successState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 0'
    },
    checkmark: {
        width: '48px',
        height: '48px',
        backgroundColor: '#FFFFFF',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '20px'
    },
    successTitle: {
        margin: '0 0 8px 0',
        fontSize: '22px',
        fontWeight: '600',
        letterSpacing: '-0.02em'
    },
    successSubtitle: {
        margin: 0,
        color: '#888888',
        fontSize: '15px'
    }
};

export default OrbitCheckout;
