export default interface IViewKey {
    [key: string]: {
        header: string
        body: string[],
        template: string
    }
}