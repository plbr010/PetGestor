export function mapInviteAcceptReason(reason: string): string {
  switch (reason) {
    case "invite_expired":
      return "Este convite expirou. Solicite um novo convite ao administrador.";
    case "invite_revoked":
      return "Este convite foi cancelado. Solicite um novo convite ao administrador.";
    case "employee_archived":
      return "Este vínculo não está mais disponível. Fale com o administrador.";
    case "employee_already_linked":
      return "Este funcionário já está vinculado a outra conta. Fale com o administrador.";
    case "no_pending_invite":
      return "Não encontramos um convite pendente para o seu e-mail.";
    case "not_authenticated":
      return "Sua sessão expirou. Entre novamente para continuar.";
    default:
      return "Não foi possível aceitar o convite. Tente novamente.";
  }
}
