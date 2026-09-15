import bcrypt from 'bcryptjs';

const PASSWORD_HASH_ROUNDS = 12;
export class PasswordService {
  static async hash(password: string,): Promise<string> {
    const normalizedPassword = this.normalize(password);
    if (normalizedPassword.length < 8) {
      throw new Error('Password must contain at least 8 characters.',);
    }

    return bcrypt.hash(normalizedPassword,PASSWORD_HASH_ROUNDS,);
  }

  static async verify(password: string,passwordHash: string,): Promise<boolean> {
    if (!password ||!passwordHash) {
      return false;
    }

    if (!this.isBcryptHash(passwordHash,)) {
      return false;
    }

    try {
      return await bcrypt.compare(this.normalize(password),passwordHash,);
    } catch {
      return false;
    }
  }

 
  static isBcryptHash(value: string,): boolean {
    if (!value) {
      return false;
    }
    return /^\$2[aby]\$\d{2}\$.{53}$/.test(value,);
  }
 
  static async hashIfNeeded(value: string,): Promise<string> {
    if (this.isBcryptHash(value)) {
      return value;
    }
    return this.hash(value);
  }

  private static normalize(password: string,): string { 
    return String(password);
  }
}

export default PasswordService;