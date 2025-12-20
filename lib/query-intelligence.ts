export interface QueryAnalysis {
    type: string;
    entities: {
        sfsNumbers: string[];
        authorities: string[];
        docTypes: string[];
        years: number[];
    };
    expandedTerms: string[];
}
