import userModel from "../models/userModel.js";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import razorpay from 'razorpay'
import transactionModel from '../models/transactionModel.js'
import crypto from "crypto";

export const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.json({ success: false, message: 'Missing Details' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const existingUser = await userModel.findOne({ email });
            if (existingUser) {
                return res.json({ success: false, message: 'Email already registered' });
            }

        const userData = {
            name,
            email,
            password: hashedPassword,
        };

        const newUser = new userModel(userData);
        const user = await newUser.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

        res.json({ success: true, token, user: { name: user.name } });

    } catch (error) {
        console.error('Registration Error:', error);
        res.json({ success: false, message: error.message });
    }
};

export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.json({ success: false, message: 'User does not exist' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
            res.json({ success: true, token, user: { name: user.name } });
        } else {
            return res.json({ success: false, message: 'Incorrect password' });
        }

    } catch (error) {
        console.error('Login Error:', error);
        res.json({ success: false, message: error.message });
    }
};

export const userCredits = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await userModel.findById(userId);
        res.json({ success: true, credits: user.creditBalance, user: { name: user.name } });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

export const razorpayInstance = new razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

export const paymentRazorpay = async(req, res)=> {
    try{
        const userId = req.user.id;
        const {planId} = req.body

        if(!userId || !planId){
            return res.json({success: false, message: 'Missing Details'})
        }

        let credits, plan, amount, date

        switch(planId){
            case 'Basic':
                plan = 'Basic'
                credits = 100
                amount = 10
                break;
            
            case 'Advanced':
                plan = 'Advanced'
                credits = 500
                amount = 50
                break;
            
            case 'Business':
                plan = 'Business'
                credits = 5000
                amount = 250
                break;
            
            default:
                return res.json({success: false, message: 'Plan not found'});
            
        }
           date = Date.now();

           const transactionData = {
            userId, plan, amount, credits, date
           }

           const newTransaction = await transactionModel.create(transactionData)

           const options = {
            amount : amount * 100,
            currency : process.env.CURRENCY,
            receipt: newTransaction._id,
           }
           const order = await razorpayInstance.orders.create(options);

           newTransaction.razorpayOrderId = order.id;
           await newTransaction.save();
           res.json({ success: true, order });



    } catch(error){
        console.log(error)
        res.json({success: false, message: error.message})
    }
};


export const verifyRazorpayPayment = async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.json({ success: false, message: "Payment verification failed" });
        }

        const transaction = await transactionModel.findOne({ razorpayOrderId: razorpay_order_id });

        if (!transaction) {
            return res.json({ success: false, message: "Transaction not found" });
        }

        if (!transaction.payment) {
            transaction.payment = true;
            transaction.razorpayPaymentId = razorpay_payment_id;
            await transaction.save();

            const user = await userModel.findById(transaction.userId);
            user.creditBalance += transaction.credits;
            await user.save();
        }

        res.json({ success: true, message: "Payment verified and credits added" });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: error.message });
    }
};
