export type ProfileRole = 'engineer' | 'manager';

export interface ManagerRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface EngineerRow {
  id: string;
  fullName: string;
  email: string | null;
}

export interface CrewMemberRow {
  id: string;
  fullName: string;
  role: string | null;
  phone: string | null;
  documentId: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CurrentUserProfile {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: ProfileRole;
  isActive: boolean;
}

export interface CreateCrewInput {
  fullName: string;
  role?: string | null;
  phone?: string | null;
  documentId?: string | null;
  notes?: string | null;
}

export interface UpdateCrewInput {
  id: string;
  fullName: string;
  role?: string | null;
  phone?: string | null;
  documentId?: string | null;
  notes?: string | null;
  isActive: boolean;
}

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };
