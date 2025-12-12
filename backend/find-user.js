import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function findValidUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Try to find a user
    const User = mongoose.model('User', {
      username: String,
      email: String,
      role: String
    });

    const user = await User.findOne({}).lean();
    if (user) {
      console.log('Found user:', {
        id: user._id,
        username: user.username,
        role: user.role
      });
    } else {
      console.log('No users found in database');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

findValidUser();
