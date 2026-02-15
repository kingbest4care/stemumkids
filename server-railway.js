// server.js - Simple Node.js server for Railway (NO WEBHOOK REQUIRED)
// This version works even without webhook secret configured

const express = require('express');
const cors = require('cors');

// Get Stripe key from environment variable
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
    console.error('❌ ERROR: STRIPE_SECRET_KEY environment variable is missing!');
    console.error('Please add your Stripe secret key in Railway environment variables');
    process.exit(1);
}

const stripe = require('stripe')(stripeSecretKey);
const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*'; // Allow all origins by default

console.log('🔧 Starting server with configuration:');
console.log('   PORT:', PORT);
console.log('   Stripe Mode:', stripeSecretKey.startsWith('sk_live') ? 'LIVE ⚠️' : 'TEST ✅');
console.log('   Frontend URL:', FRONTEND_URL);

// Middleware
app.use(cors({
    origin: FRONTEND_URL === 'https://stemumkids.sophoraconsult.com/stemum-registration' ? '*' : FRONTEND_URL.split(','),
    credentials: true
}));
app.use(express.json());

// Health check endpoint (for Railway)
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok',
        message: 'STEMum Course Registration API is running',
        timestamp: new Date().toISOString(),
        mode: stripeSecretKey.startsWith('sk_live') ? 'LIVE' : 'TEST'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        message: 'Server is healthy',
        timestamp: new Date().toISOString()
    });
});

// Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
    try {
        console.log('📝 Received checkout request');
        
        const { lineItems, customerEmail, successUrl, cancelUrl, metadata } = req.body;

        // Validate input
        if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
            console.error('❌ Invalid request: No line items');
            return res.status(400).json({ 
                error: 'Invalid request',
                message: 'No items in cart' 
            });
        }

        console.log('📊 Creating session for', lineItems.length, 'items');
        console.log('📧 Customer email:', customerEmail);

        // Transform line items to Stripe format
        const stripeLineItems = lineItems.map(item => ({
            price_data: {
                currency: item.currency || 'usd',
                product_data: {
                    name: item.name,
                    description: item.description || '',
                },
                unit_amount: Math.round(item.amount), // Ensure it's an integer
            },
            quantity: item.quantity || 1,
        }));

        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: stripeLineItems,
            mode: 'payment',
            success_url: successUrl || `${req.headers.origin}/success.html`,
            cancel_url: cancelUrl || `${req.headers.origin}/cancel.html`,
            customer_email: customerEmail,
            billing_address_collection: 'required',
            metadata: metadata || {},
        });

        console.log('✅ Session created successfully:', session.id);

        res.json({ 
            id: session.id,
            url: session.url 
        });

    } catch (error) {
        console.error('❌ Error creating checkout session:', error.message);
        res.status(500).json({ 
            error: 'Failed to create checkout session',
            message: error.message 
        });
    }
});

// Success page (optional - if no frontend success page exists)
app.get('/success.html', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Successful</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    background: white;
                    padding: 60px;
                    border-radius: 20px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-width: 600px;
                }
                .icon {
                    font-size: 100px;
                    margin-bottom: 30px;
                    animation: bounce 1s ease;
                }
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-20px); }
                }
                h1 {
                    color: #4caf50;
                    margin-bottom: 20px;
                }
                p {
                    color: #666;
                    line-height: 1.8;
                    margin-bottom: 20px;
                    font-size: 1.1em;
                }
                .highlight {
                    background: #f0f4ff;
                    padding: 20px;
                    border-radius: 10px;
                    margin: 30px 0;
                }
                .btn {
                    display: inline-block;
                    padding: 15px 40px;
                    background: #667eea;
                    color: white;
                    text-decoration: none;
                    border-radius: 10px;
                    font-weight: 600;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon">✅</div>
                <h1>Payment Successful!</h1>
                <p>Thank you for enrolling in our courses!</p>
                <div class="highlight">
                    <p><strong>What's next?</strong></p>
                    <p>📧 Check your email for enrollment confirmation<br>
                    🎓 Access your courses through the student portal<br>
                    📚 Download your course materials</p>
                </div>
                <p><strong>Your learning journey starts now!</strong></p>
                <a href="/" class="btn">Return to Home</a>
            </div>
        </body>
        </html>
    `);
});

// Cancel page
app.get('/cancel.html', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Cancelled</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    background: white;
                    padding: 60px;
                    border-radius: 20px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-width: 600px;
                }
                .icon {
                    font-size: 100px;
                    margin-bottom: 30px;
                }
                h1 {
                    color: #ff6b6b;
                    margin-bottom: 20px;
                }
                p {
                    color: #666;
                    line-height: 1.8;
                    margin-bottom: 20px;
                    font-size: 1.1em;
                }
                .btn {
                    display: inline-block;
                    padding: 15px 40px;
                    background: #667eea;
                    color: white;
                    text-decoration: none;
                    border-radius: 10px;
                    font-weight: 600;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon">❌</div>
                <h1>Payment Cancelled</h1>
                <p>Your payment was cancelled. No charges were made.</p>
                <p>Feel free to return and complete your enrollment whenever you're ready.</p>
                <a href="/" class="btn">Return to Courses</a>
            </div>
        </body>
        </html>
    `);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.url} not found`
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ========================================');
    console.log('   STEMum Course Registration API');
    console.log('========================================');
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`💳 Stripe mode: ${stripeSecretKey.startsWith('sk_live') ? 'LIVE ⚠️' : 'TEST ✅'}`);
    console.log('========================================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('👋 SIGINT received, shutting down gracefully...');
    process.exit(0);
});

module.exports = app;
