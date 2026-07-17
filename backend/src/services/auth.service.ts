import bcrypt from "bcrypt";

import { prisma } from "../lib/prisma";

import { generateToken } from "../utils/jwt";

interface RegisterData {

  email: string;

  password: string;

  phone?: string;

}

interface LoginData {

  email: string;

  password: string;

}

export async function register(
  data: RegisterData
) {

  const {
    email,
    password,
    phone
  } = data;


  const existingUser =
    await prisma.user.findUnique({

      where: {
        email
      }

    });


  if (existingUser) {

    throw new Error(
      "Cet email est déjà utilisé"
    );

  }


  if (phone) {

    const existingPhone =
      await prisma.user.findUnique({

        where: {
          phone
        }

      });


    if (existingPhone) {

      throw new Error(
        "Ce numéro est déjà utilisé"
      );

    }

  }


  const hashedPassword =
    await bcrypt.hash(
      password,
      10
    );


  const user =
    await prisma.user.create({

      data: {

        email,

        password:
          hashedPassword,

        phone

      }

    });


  const token =
    generateToken({

      userId:
        user.id,

      role:
        user.role

    });


  return {

    user: {

      id: user.id,

      email: user.email,

      phone: user.phone,

      role: user.role

    },

    token

  };

}


export async function login(
  data: LoginData
) {

  const {
    email,
    password
  } = data;


  const user =
    await prisma.user.findUnique({

      where: {
        email
      }

    });


  if (!user) {

    throw new Error(
      "Identifiants invalides"
    );

  }


  const passwordMatch =
    await bcrypt.compare(
      password,
      user.password
    );


  if (!passwordMatch) {

    throw new Error(
      "Identifiants invalides"
    );

  }


  const token =
    generateToken({

      userId:
        user.id,

      role:
        user.role

    });


  return {

    user: {

      id: user.id,

      email: user.email,

      phone: user.phone,

      role: user.role

    },

    token

  };

}


export async function getCurrentUser(
  userId: string
) {

  const user =
    await prisma.user.findUnique({

      where: {
        id: userId
      },

      select: {

        id: true,

        email: true,

        phone: true,

        role: true,

        createdAt: true

      }

    });

  if (!user) {

    throw new Error(
      "Utilisateur introuvable"
    );

  }

  return user;

}