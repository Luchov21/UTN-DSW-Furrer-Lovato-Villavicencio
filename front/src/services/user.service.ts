import type { User, UpdateProfilePayload } from '../types/user';
import { AxiosError } from 'axios';
import api from './api';

interface NestErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof AxiosError)) return fallback;
  if (!error.response) {
    return 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
  }
  const data = error.response.data as NestErrorBody | undefined;
  const backendMessage = Array.isArray(data?.message)
    ? data.message.join(', ')
    : data?.message;
  return backendMessage || fallback;
};

// Self-service.
export const updateMyProfile = async (
  payload: UpdateProfilePayload,
): Promise<Omit<User, 'password'>> => {
  try {
    const { data } = await api.patch<Omit<User, 'password'>>(
      '/user/me',
      payload,
    );
    return data;
  } catch (error: unknown) {
    throw new Error(
      getErrorMessage(error, 'No se pudo actualizar tu perfil.'),
      { cause: error },
    );
  }
};

// Everything else here is admin-only: UserController is gated with
// @Auth(Role.ADMIN) at class level. This used to use raw fetch with no
// Authorization header, which could never have worked once the guard existed,
// so it goes through the `api` instance and the JWT travels with it.
export const getUsers = async (): Promise<User[]> => {
  try {
    const { data } = await api.get<User[]>('/user');
    return data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, 'Error al obtener la lista de usuarios'),
      { cause: error },
    );
  }
};

export interface UserSearchQuery {
  id?: number;
  dni?: number;
  email?: string;
  name?: string;
  surname?: string;
}

// Searching by dni survives this deliberately — it is how the front desk
// finds a member by the number on their document. Only *addressing* a row
// (the functions below) moved to the id.
export const searchUsers = async (query: UserSearchQuery): Promise<User[]> => {
  try {
    const params: Record<string, string> = {};
    if (Number.isFinite(query.id)) params.id = String(query.id);
    if (Number.isFinite(query.dni)) params.dni = String(query.dni);
    if (query.email?.trim()) params.email = query.email.trim();
    if (query.name?.trim()) params.name = query.name.trim();
    if (query.surname?.trim()) params.surname = query.surname.trim();

    const { data } = await api.get<User[]>('/user/search', { params });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'No se pudo buscar usuarios.'), {
      cause: error,
    });
  }
};

export const getUserById = async (id: number): Promise<User> => {
  try {
    const { data } = await api.get<User>(`/user/${id}`);
    return data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, `Error al obtener usuario con ID ${id}`),
      { cause: error },
    );
  }
};

export interface AdminUpdateUserPayload {
  // Correcting a typo in a member's document number is an admin action. A
  // member cannot do this to themselves — updateMyProfile's payload has no
  // such field.
  dni?: number;
  name?: string;
  surname?: string;
  email?: string;
  phone?: string;
  role?: 'user' | 'admin';
}

// Admin-side edit (profile + role). It never touches password — see
// AdminUpdateUserDto on the backend for why.
export const adminUpdateUser = async (
  id: number,
  payload: AdminUpdateUserPayload,
): Promise<Omit<User, 'password'>> => {
  try {
    const { data } = await api.patch<Omit<User, 'password'>>(
      `/user/${id}`,
      payload,
    );
    return data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, 'No se pudo actualizar el usuario.'),
      { cause: error },
    );
  }
};

export const deleteUser = async (id: number): Promise<boolean> => {
  try {
    const { data } = await api.delete(`/user/${id}`);
    return data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, `Error al eliminar usuario con ID ${id}`),
      { cause: error },
    );
  }
};

export const restoreUser = async (id: number): Promise<boolean> => {
  try {
    const { data } = await api.patch(`/user/restore/${id}`);
    return data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, `Error al restaurar usuario con ID ${id}`),
      { cause: error },
    );
  }
};

// Front-desk creation. Every optional field is omitted rather than sent empty:
// the backend DTO validates `email` with @IsEmail, so an empty string is a 400,
// and forbidNonWhitelisted rejects anything the DTO does not declare.
export interface AdminCreateUserPayload {
  dni: number;
  name: string;
  surname: string;
  phone?: string;
  email?: string;
  password?: string;
}

// The plaintext of a password the backend generated because the admin left the
// field blank. Present on this response and nowhere else in the API — it is
// never stored in the clear, so it cannot be fetched again.
export type AdminCreatedUser = Omit<User, 'password'> & {
  generatedPassword?: string;
};

export const adminCreateUser = async (
  payload: AdminCreateUserPayload,
): Promise<AdminCreatedUser> => {
  try {
    const { data } = await api.post<AdminCreatedUser>('/user', payload);
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'No se pudo crear el socio.'), {
      cause: error,
    });
  }
};

export interface CredentialsSlipPayload {
  password: string;
  planName?: string;
  termLabel?: string;
}

export interface CredentialsSlipResult {
  printStatus: 'sent' | 'error' | 'not_configured';
  printError?: string;
}

export const printCredentialsSlip = async (
  userId: number,
  payload: CredentialsSlipPayload,
): Promise<CredentialsSlipResult> => {
  try {
    const { data } = await api.post<CredentialsSlipResult>(
      `/user/${userId}/credentials-slip`,
      payload,
    );
    return data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, 'No se pudo imprimir el comprobante.'),
      { cause: error },
    );
  }
};
