// server-with-env.js - Enhanced Node.js Express server with environment variables

require('dotenv').config(); // Load environment variables
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middleware
app.use(cors());
app.use(express.static('public')); // Serve your HTML files from 'public' folder

// Use raw body for webhook endpoint
app.use((req, res, next) => {
    if (req.originalUrl === '/webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});

// Configuration
const config = {
    port: process.env.PORT || 3000,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    successUrl: process.env.SUCCESS_URL || 'http://localhost:3000/success.html',
    cancelUrl: process.env.CANCEL_URL || 'http://localhost:3000/cancel.html',
    taxRate: parseFloat(process.env.TAX_RATE) || 0.10,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
};

// Validate required environment variables
if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌ ERROR: STRIPE_SECRET_KEY is not set in environment variables');
    process.exit(1);
}

// Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { lineItems, successUrl, cancelUrl } = req.body;

        if (!lineItems || lineItems.length === 0) {
            return res.status(400).json({ 
                error: 'No items in cart' 
            });
        }

        // Transform line items to Stripe format
        const stripeLineItems = lineItems.map(item => ({
            price_data: {
                currency: item.currency || 'usd',
                product_data: {
                    name: item.name,
                    description: item.description || '',
                },
                unit_amount: item.amount, // Amount in cents
            },
            quantity: item.quantity || 1,
        }));

        // Extract course names for metadata
        const courseNames = lineItems
            .filter(item => !item.name.includes('Tax'))
            .map(item => item.name)
            .join(', ');

        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: stripeLineItems,
            mode: 'payment',
            success_url: successUrl || config.successUrl,
            cancel_url: cancelUrl || config.cancelUrl,
            billing_address_collection: 'required',
            customer_email: req.body.customerEmail || undefined,
            allow_promotion_codes: true, // Enable discount codes
            metadata: {
                orderDate: new Date().toISOString(),
                courses: courseNames,
                itemCount: lineItems.length
            },
            // Optional: Set up automatic tax calculation
            // automatic_tax: { enabled: true }
        });

        console.log('✅ Checkout session created:', session.id);

        res.json({ 
            id: session.id,
            url: session.url 
        });

    } catch (error) {
        console.error('❌ Stripe checkout error:', error.message);
        res.status(500).json({ 
            error: 'Failed to create checkout session',
            message: error.message 
        });
    }
});

// Webhook endpoint for Stripe events
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!config.webhookSecret) {
        console.warn('⚠️  WARNING: Webhook secret not configured');
        return res.status(400).send('Webhook secret not configured');
    }

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, config.webhookSecret);
    } catch (err) {
        console.log(`❌ Webhook signature verification failed:`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('✅ Payment successful:', {
                sessionId: session.id,
                customerEmail: session.customer_email,
                amountTotal: session.amount_total / 100,
                courses: session.metadata.courses
            });
            
            // TODO: Implement these functions based on your needs
            await handleSuccessfulPayment(session);
            
            break;
        
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            console.log('✅ PaymentIntent succeeded:', paymentIntent.id);
            break;
        
        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;
            console.log('❌ Payment failed:', {
                id: failedPayment.id,
                error: failedPayment.last_payment_error?.message
            });
            break;
        
        case 'checkout.session.expired':
            const expiredSession = event.data.object;
            console.log('⏰ Session expired:', expiredSession.id);
            break;

        default:
            console.log(`ℹ️  Unhandled event type: ${event.type}`);
    }

    res.json({received: true});
});

// Handle successful payment
async function handleSuccessfulPayment(session) {
    const customerEmail = session.customer_email;
    const courses = session.metadata.courses;
    const amountPaid = session.amount_total / 100;

    console.log('📧 Processing enrollment for:', {
        email: customerEmail,
        courses: courses,
        amount: amountPaid
    });

    // TODO: Implement your business logic here:
    
    // 1. Send confirmation email
    // await sendEnrollmentEmail(customerEmail, courses);
    
    // 2. Grant course access in your LMS/database
    // await grantCourseAccess(customerEmail, courses);
    
    // 3. Create student account if needed
    // await createStudentAccount(customerEmail, courses);
    
    // 4. Log to database
    // await logEnrollment({
    //     email: customerEmail,
    //     courses: courses,
    //     amount: amountPaid,
    //     stripeSessionId: session.id,
    //     date: new Date()
    // });
    
    // 5. Trigger any automation/workflows
    // await triggerWelcomeWorkflow(customerEmail);
}

// Success page
app.get('/success.html', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Successful - Course Enrollment</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    background: white;
                    padding: 60px;
                    border-radius: 20px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-width: 600px;
                    width: 100%;
                }
                .success-icon {
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
                    font-size: 2.5em;
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
                .highlight strong {
                    color: #667eea;
                }
                .btn {
                    display: inline-block;
                    padding: 15px 40px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 10px;
                    font-weight: 600;
                    transition: transform 0.3s, box-shadow 0.3s;
                    margin-top: 20px;
                }
                .btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="success-icon">✅</div>
                <h1>Payment Successful!</h1>
                <p>Thank you for enrolling in our courses!</p>
                
                <div class="highlight">
                    <p><strong>What happens next?</strong></p>
                    <p>📧 Check your email for enrollment confirmation<br>
                    🎓 Access your courses through the student portal<br>
                    📚 Download course materials and resources<br>
                    👋 Meet your instructors and fellow students</p>
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
            <title>Payment Cancelled - Course Enrollment</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    background: white;
                    padding: 60px;
                    border-radius: 20px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-width: 600px;
                    width: 100%;
                }
                .cancel-icon {
                    font-size: 100px;
                    margin-bottom: 30px;
                }
                h1 {
                    color: #ff4757;
                    margin-bottom: 20px;
                    font-size: 2.5em;
                }
                p {
                    color: #666;
                    line-height: 1.8;
                    margin-bottom: 20px;
                    font-size: 1.1em;
                }
                .info-box {
                    background: #fff3cd;
                    padding: 20px;
                    border-radius: 10px;
                    margin: 30px 0;
                    border-left: 4px solid #ffc107;
                }
                .btn {
                    display: inline-block;
                    padding: 15px 40px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 10px;
                    font-weight: 600;
                    transition: transform 0.3s, box-shadow 0.3s;
                    margin-top: 20px;
                }
                .btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="cancel-icon">❌</div>
                <h1>Payment Cancelled</h1>
                <p>Your payment was cancelled and no charges were made to your account.</p>
                
                <div class="info-box">
                    <p><strong>Your cart is still saved!</strong></p>
                    <p>Return anytime to complete your enrollment. We're here to help if you have any questions.</p>
                </div>
                
                <p>Feel free to reach out to our support team if you need assistance.</p>
                <a href="/" class="btn">Return to Courses</a>
            </div>
        </body>
        </html>
    `);
});

// API endpoint to get publishable key (for frontend)
app.get('/config', (req, res) => {
    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        message: 'Server is running',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Route ${req.url} not found`
    });
});

// Start server
app.listen(config.port, () => {
    console.log('\n🚀 ========================================');
    console.log('   Course Enrollment Server Started');
    console.log('========================================');
    console.log(`📍 Server URL: http://localhost:${config.port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💳 Stripe Mode: ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'LIVE' : 'TEST'}`);
    console.log('========================================\n');
    
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.warn('⚠️  WARNING: Webhook secret not configured');
        console.log('ℹ️  To test webhooks locally, run:');
        console.log('   stripe listen --forward-to localhost:' + config.port + '/webhook\n');
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

module.exports = app;
