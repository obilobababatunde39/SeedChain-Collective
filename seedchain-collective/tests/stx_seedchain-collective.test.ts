import { describe, expect, it } from "vitest";

// Mock STX Seedchain Collective implementation
interface Project {
  projectId: number;
  name: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  status: string;
}

interface Investment {
  investor: string;
  projectId: number;
  amount: number;
  investmentDate: number;
}

class MockSTXSeedchainCollective {
  private admin: string = "admin";
  private investmentTarget: number = 0;
  private investmentDeadline: number = 0;
  private investmentRaised: number = 0;
  private investmentActive: boolean = false;
  private currentSender: string = "admin";
  private currentBlockHeight: number = 1000;
  
  private projects: Map<number, Project> = new Map();
  private investments: Map<string, Investment> = new Map();

  // Error constants
  private readonly ERR_NOT_AUTHORIZED = 100;
  private readonly ERR_ALREADY_INITIALIZED = 101;
  private readonly ERR_INSUFFICIENT_FUNDS = 102;
  private readonly ERR_INVALID_AMOUNT = 103;
  private readonly ERR_PROJECT_NOT_FOUND = 104;
  private readonly ERR_INVESTMENT_CLOSED = 105;
  private readonly ERR_TRANSFER_FAILED = 107;

  setSender(sender: string) {
    this.currentSender = sender;
  }

  setBlockHeight(height: number) {
    this.currentBlockHeight = height;
  }

  private isAdmin(): boolean {
    return this.currentSender === this.admin;
  }

  private getInvestmentKey(investor: string, projectId: number): string {
    return `${investor}-${projectId}`;
  }

  initialize(newAdmin: string, target: number, deadline: number): { success: boolean; error?: number } {
    if (this.currentSender !== this.admin) {
      return { success: false, error: this.ERR_ALREADY_INITIALIZED };
    }

    this.admin = newAdmin;
    this.investmentTarget = target;
    this.investmentDeadline = deadline;
    this.investmentActive = true;

    return { success: true };
  }

  addProject(projectId: number, name: string, description: string, targetAmount: number): { success: boolean; error?: number } {
    if (!this.isAdmin()) {
      return { success: false, error: this.ERR_NOT_AUTHORIZED };
    }

    if (this.projects.has(projectId)) {
      return { success: false, error: this.ERR_ALREADY_INITIALIZED };
    }

    this.projects.set(projectId, {
      projectId,
      name,
      description,
      targetAmount,
      currentAmount: 0,
      status: "funding"
    });

    return { success: true };
  }

  invest(projectId: number, amount: number): { success: boolean; error?: number } {
    if (!this.investmentActive) {
      return { success: false, error: this.ERR_INVESTMENT_CLOSED };
    }

    if (amount <= 0) {
      return { success: false, error: this.ERR_INVALID_AMOUNT };
    }

    const project = this.projects.get(projectId);
    if (!project) {
      return { success: false, error: this.ERR_PROJECT_NOT_FOUND };
    }

    if (project.targetAmount < project.currentAmount + amount) {
      return { success: false, error: this.ERR_INSUFFICIENT_FUNDS };
    }

    // Record investment
    const investmentKey = this.getInvestmentKey(this.currentSender, projectId);
    this.investments.set(investmentKey, {
      investor: this.currentSender,
      projectId,
      amount,
      investmentDate: this.currentBlockHeight
    });

    // Update project
    project.currentAmount += amount;
    this.projects.set(projectId, project);

    // Update total raised
    this.investmentRaised += amount;

    return { success: true };
  }

  closeInvestmentRound(): { success: boolean; error?: number } {
    if (!this.isAdmin()) {
      return { success: false, error: this.ERR_NOT_AUTHORIZED };
    }

    this.investmentActive = false;
    return { success: true };
  }

  // Read-only functions
  getInvestment(investor: string, projectId: number): Investment | null {
    const investmentKey = this.getInvestmentKey(investor, projectId);
    return this.investments.get(investmentKey) || null;
  }

  getProject(projectId: number): Project | null {
    return this.projects.get(projectId) || null;
  }

  getAdmin(): string {
    return this.admin;
  }

  getInvestmentTarget(): number {
    return this.investmentTarget;
  }

  getInvestmentDeadline(): number {
    return this.investmentDeadline;
  }

  getInvestmentRaised(): number {
    return this.investmentRaised;
  }

  isInvestmentActive(): boolean {
    return this.investmentActive;
  }
}

describe("STX Seedchain Collective", () => {
  let collective: MockSTXSeedchainCollective;

  beforeEach(() => {
    collective = new MockSTXSeedchainCollective();
  });

  describe("Initialization", () => {
    it("should initialize the collective successfully", () => {
      const result = collective.initialize("new-admin", 1000000, 5000);
      
      expect(result.success).toBe(true);
      expect(collective.getAdmin()).toBe("new-admin");
      expect(collective.getInvestmentTarget()).toBe(1000000);
      expect(collective.getInvestmentDeadline()).toBe(5000);
      expect(collective.isInvestmentActive()).toBe(true);
    });

    it("should reject initialization from non-admin", () => {
      collective.setSender("user1");
      const result = collective.initialize("new-admin", 1000000, 5000);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(101); // ERR_ALREADY_INITIALIZED
    });

    it("should maintain original admin if initialization fails", () => {
      collective.setSender("user1");
      collective.initialize("new-admin", 1000000, 5000);
      
      expect(collective.getAdmin()).toBe("admin");
    });
  });

  describe("Project Management", () => {
    beforeEach(() => {
      collective.initialize("admin", 1000000, 5000);
    });

    it("should add a project successfully", () => {
      const result = collective.addProject(1, "DeFi Protocol", "A new DeFi protocol", 500000);
      
      expect(result.success).toBe(true);
      
      const project = collective.getProject(1);
      expect(project).not.toBeNull();
      expect(project!.name).toBe("DeFi Protocol");
      expect(project!.description).toBe("A new DeFi protocol");
      expect(project!.targetAmount).toBe(500000);
      expect(project!.currentAmount).toBe(0);
      expect(project!.status).toBe("funding");
    });

    it("should reject project addition from non-admin", () => {
      collective.setSender("user1");
      const result = collective.addProject(1, "DeFi Protocol", "A new DeFi protocol", 500000);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(100); // ERR_NOT_AUTHORIZED
    });

    it("should handle multiple projects", () => {
      collective.addProject(1, "Project A", "Description A", 300000);
      collective.addProject(2, "Project B", "Description B", 700000);
      
      const projectA = collective.getProject(1);
      const projectB = collective.getProject(2);
      
      expect(projectA!.name).toBe("Project A");
      expect(projectB!.name).toBe("Project B");
      expect(projectA!.targetAmount).toBe(300000);
      expect(projectB!.targetAmount).toBe(700000);
    });

    it("should return null for non-existent project", () => {
      const project = collective.getProject(999);
      expect(project).toBeNull();
    });
  });

  describe("Investment Operations", () => {
    beforeEach(() => {
      collective.initialize("admin", 1000000, 5000);
      collective.addProject(1, "DeFi Protocol", "A new DeFi protocol", 500000);
    });

    it("should allow investment in a project", () => {
      collective.setSender("investor1");
      const result = collective.invest(1, 100000);
      
      expect(result.success).toBe(true);
      
      const investment = collective.getInvestment("investor1", 1);
      expect(investment).not.toBeNull();
      expect(investment!.amount).toBe(100000);
      expect(investment!.investor).toBe("investor1");
      expect(investment!.projectId).toBe(1);
      
      const project = collective.getProject(1);
      expect(project!.currentAmount).toBe(100000);
      expect(collective.getInvestmentRaised()).toBe(100000);
    });

    it("should reject investment when collective is closed", () => {
      collective.closeInvestmentRound();
      collective.setSender("investor1");
      
      const result = collective.invest(1, 100000);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(105); // ERR_INVESTMENT_CLOSED
    });

    it("should reject investment with invalid amount", () => {
      collective.setSender("investor1");
      const result = collective.invest(1, 0);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(103); // ERR_INVALID_AMOUNT
    });

    it("should reject investment in non-existent project", () => {
      collective.setSender("investor1");
      const result = collective.invest(999, 100000);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(104); // ERR_PROJECT_NOT_FOUND
    });

    it("should reject investment exceeding project target", () => {
      collective.setSender("investor1");
      const result = collective.invest(1, 600000); // Exceeds 500000 target
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(102); // ERR_INSUFFICIENT_FUNDS
    });

    it("should handle multiple investments in same project", () => {
      collective.setSender("investor1");
      collective.invest(1, 100000);
      
      collective.setSender("investor2");
      collective.invest(1, 200000);
      
      const project = collective.getProject(1);
      expect(project!.currentAmount).toBe(300000);
      expect(collective.getInvestmentRaised()).toBe(300000);
      
      const investment1 = collective.getInvestment("investor1", 1);
      const investment2 = collective.getInvestment("investor2", 1);
      
      expect(investment1!.amount).toBe(100000);
      expect(investment2!.amount).toBe(200000);
    });

    it("should record investment date correctly", () => {
      collective.setBlockHeight(2000);
      collective.setSender("investor1");
      collective.invest(1, 100000);
      
      const investment = collective.getInvestment("investor1", 1);
      expect(investment!.investmentDate).toBe(2000);
    });
  });

  describe("Investment Round Management", () => {
    beforeEach(() => {
      collective.initialize("admin", 1000000, 5000);
      collective.addProject(1, "DeFi Protocol", "A new DeFi protocol", 500000);
    });

    it("should close investment round successfully", () => {
      const result = collective.closeInvestmentRound();
      
      expect(result.success).toBe(true);
      expect(collective.isInvestmentActive()).toBe(false);
    });

    it("should reject closing investment round from non-admin", () => {
      collective.setSender("user1");
      const result = collective.closeInvestmentRound();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(100); // ERR_NOT_AUTHORIZED
    });

    it("should prevent investments after round is closed", () => {
      collective.closeInvestmentRound();
      collective.setSender("investor1");
      
      const result = collective.invest(1, 100000);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(105); // ERR_INVESTMENT_CLOSED
    });
  });

  describe("Data Retrieval", () => {
    beforeEach(() => {
      collective.initialize("admin", 1000000, 5000);
      collective.addProject(1, "DeFi Protocol", "A new DeFi protocol", 500000);
      collective.setSender("investor1");
      collective.invest(1, 100000);
    });

    it("should retrieve investment data correctly", () => {
      const investment = collective.getInvestment("investor1", 1);
      
      expect(investment).not.toBeNull();
      expect(investment!.investor).toBe("investor1");
      expect(investment!.projectId).toBe(1);
      expect(investment!.amount).toBe(100000);
    });

    it("should return null for non-existent investment", () => {
      const investment = collective.getInvestment("investor2", 1);
      expect(investment).toBeNull();
    });

    it("should retrieve project data correctly", () => {
      const project = collective.getProject(1);
      
      expect(project).not.toBeNull();
      expect(project!.name).toBe("DeFi Protocol");
      expect(project!.targetAmount).toBe(500000);
      expect(project!.currentAmount).toBe(100000);
    });

    it("should track total investment raised", () => {
      collective.setSender("investor2");
      collective.invest(1, 150000);
      
      expect(collective.getInvestmentRaised()).toBe(250000);
    });

    it("should maintain investment target and deadline", () => {
      expect(collective.getInvestmentTarget()).toBe(1000000);
      expect(collective.getInvestmentDeadline()).toBe(5000);
    });
  });

  describe("Edge Cases", () => {
    beforeEach(() => {
      collective.initialize("admin", 1000000, 5000);
    });

    it("should handle investment at exact project target", () => {
      collective.addProject(1, "Small Project", "Description", 100000);
      collective.setSender("investor1");
      
      const result = collective.invest(1, 100000);
      
      expect(result.success).toBe(true);
      
      const project = collective.getProject(1);
      expect(project!.currentAmount).toBe(100000);
      expect(project!.targetAmount).toBe(100000);
    });

    it("should handle multiple projects with different funding levels", () => {
      collective.addProject(1, "Project A", "Description A", 200000);
      collective.addProject(2, "Project B", "Description B", 300000);
      
      collective.setSender("investor1");
      collective.invest(1, 150000);
      collective.invest(2, 100000);
      
      const projectA = collective.getProject(1);
      const projectB = collective.getProject(2);
      
      expect(projectA!.currentAmount).toBe(150000);
      expect(projectB!.currentAmount).toBe(100000);
      expect(collective.getInvestmentRaised()).toBe(250000);
    });

    it("should maintain state consistency after failed operations", () => {
      collective.addProject(1, "Project", "Description", 100000);
      collective.setSender("investor1");
      
      // Failed investment
      collective.invest(1, 150000); // Exceeds target
      
      // Successful investment
      const result = collective.invest(1, 50000);
      
      expect(result.success).toBe(true);
      expect(collective.getInvestmentRaised()).toBe(50000);
    });
  });
});