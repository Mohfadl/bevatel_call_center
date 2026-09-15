import 'dotenv/config';

import {
    PrismaMariaDb,
} from '@prisma/adapter-mariadb';

import {
    PrismaClient,
} from '../generated/prisma/client';


type DatabaseConfig = {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
};


function getDatabaseConfig(): DatabaseConfig {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl) {
        const url = new URL(databaseUrl,);
        const protocol = url.protocol.replace(':','',);
        if (protocol !== 'mysql' &&protocol !== 'mariadb') {
            throw new Error(`Unsupported database protocol: ${protocol}`,);
        }

        const database = decodeURIComponent(url.pathname.replace(/^\//,'',),);
        if (!database) {
            throw new Error('Database name is missing from DATABASE_URL.',);
        }

        const user = decodeURIComponent(url.username,);
        if (!user) {
            throw new Error('Database user is missing from DATABASE_URL.',);
        }

        return {
            host: url.hostname || '127.0.0.1',
            port: Number(url.port ||3306,),
            user,
            password: decodeURIComponent(url.password,),
            database,
        };
    }

    const host = process.env.DATABASE_HOST?.trim() || '127.0.0.1';
    const port = Number(process.env.DATABASE_PORT || 3306,);
    const user = process.env.DATABASE_USER?.trim();
    const password = process.env.DATABASE_PASSWORD;
    const database = process.env.DATABASE_NAME?.trim();
    if (!user) {
        throw new Error('DATABASE_USER is required.',);
    }

    if (password === undefined) {
        throw new Error('DATABASE_PASSWORD is required.',);
    }

    if (!database) {
        throw new Error('DATABASE_NAME is required.',);
    }

    return {
        host,
        port,
        user,
        password,
        database,
    };
}


const databaseConfig = getDatabaseConfig();
console.log('Database configuration:',
    {
        host: databaseConfig.host,
        port: databaseConfig.port,
        user: databaseConfig.user,
        database: databaseConfig.database,
        passwordConfigured: databaseConfig.password.length > 0,
    },
);

const adapter =
    new PrismaMariaDb({
        host: databaseConfig.host,
        port: databaseConfig.port,
        user: databaseConfig.user,
        password: databaseConfig.password,
        database: databaseConfig.database,
        connectionLimit: 5,
        acquireTimeout: 10000,
        connectTimeout: 10000,
    });

declare global { 
    var prisma: | PrismaClient | undefined;
}

export const prisma = globalThis.prisma ??new PrismaClient({adapter,});
if (process.env.NODE_ENV !== 'production' ) {
    globalThis.prisma = prisma;
}

export default prisma;